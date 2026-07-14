"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import init, {
  preload,
  prove_preloaded,
  verify as wasmVerify,
} from "@blueshift-gg/xark-wasm";
import { vkBytes } from "@/circuits/minesweeper/artifacts/vk";
import {
  CELLS,
  CENTER,
  MINES,
  N,
  SAFE,
  encodePublicInputs,
  floodCells,
  genBoard,
  neighbourCount,
  packBoard,
  randSalt,
  type CellReveal,
  type FloodCell,
  type RevealSet,
} from "@/lib/minesweeper-shared";
import { poseidon2Hash2 } from "@/lib/poseidon2";

import { smooth } from "@/utils/easings";

// ── constants ───────────────────────────────────────────────────────────────

const SHAKE = [0, -10, 10, -7, 7, -4, 4, 0];
const VK = vkBytes;

type CellState = {
  revealed: boolean;
  count: number;
  mine: boolean;
  proving: boolean;
  flagged: boolean;
};

const blank = (): CellState[] =>
  Array.from({ length: CELLS }, () => ({
    revealed: false,
    count: 0,
    mine: false,
    proving: false,
    flagged: false,
  }));

const bodyVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25, ease: smooth } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

function shortHex(s: string): string {
  try {
    const h = BigInt(s).toString(16).padStart(4, "0");
    return `0x${h.slice(0, 4)}…${h.slice(-4)}`;
  } catch {
    return "0x…";
  }
}

// ── wasm helpers ────────────────────────────────────────────────────────────

let wasmReady: Promise<unknown> | null = null;
function ensureWasm(): Promise<unknown> {
  if (!wasmReady) wasmReady = init();
  return wasmReady;
}

/** Load proving artifacts (xbc + pk) once. Code-split chunk, ~200KB. */
async function loadProvingArtifacts(): Promise<{
  xbc: Uint8Array;
  pk: Uint8Array;
}> {
  const [{ xbcBytes }, { pkBytes }] = await Promise.all([
    import("@/circuits/minesweeper/artifacts/xbc"),
    import("@/circuits/minesweeper/artifacts/pk"),
  ]);
  return { xbc: xbcBytes, pk: pkBytes };
}

/** Build circuit inputs from the board + revealed cells. */
function buildInputs(
  board: number[],
  salt: string,
  commitment: string,
  cells: FloodCell[],
): string {
  const revealed = new Array<number>(CELLS).fill(0);
  const isMine = new Array<number>(CELLS).fill(0);
  const count = new Array<number>(CELLS).fill(0);
  for (const { r, c, count: nc } of cells) {
    const i = r * N + c;
    revealed[i] = 1;
    isMine[i] = board[i];
    count[i] = nc;
  }
  const inputs: Record<string, string> = {};
  for (let i = 0; i < CELLS; i++) inputs[`board[${i}]`] = String(board[i]);
  inputs.salt = salt;
  inputs.commitment = commitment;
  for (let i = 0; i < CELLS; i++) inputs[`revealed[${i}]`] = String(revealed[i]);
  for (let i = 0; i < CELLS; i++) inputs[`is_mine[${i}]`] = String(isMine[i]);
  for (let i = 0; i < CELLS; i++) inputs[`count[${i}]`] = String(count[i]);
  return JSON.stringify(inputs);
}

/** Prove + produce a RevealSet for a list of flood cells. */
async function proveCells(
  board: number[],
  salt: string,
  commitment: string,
  cells: FloodCell[],
): Promise<RevealSet> {
  const inputs = buildInputs(board, salt, commitment, cells);
  const { proof }: { proof: Uint8Array } = prove_preloaded(inputs);
  const cellReveals: CellReveal[] = cells.map(({ r, c, count: nc }) => ({
    r,
    c,
    isMine: board[r * N + c] === 1,
    count: nc,
  }));
  return { proof: proof.toBase64(), cells: cellReveals };
}

/** Verify a reveal against the committed board. */
async function verify(rs: RevealSet, committed: string): Promise<boolean> {
  await ensureWasm();
  const publicInputs = encodePublicInputs(committed, rs.cells);
  return wasmVerify(VK, Uint8Array.fromBase64(rs.proof), publicInputs);
}

// ── component ───────────────────────────────────────────────────────────────

export function MinesweeperDemo() {
  const [cells, setCells] = useState<CellState[]>(blank);
  const [status, setStatus] = useState<
    "loading" | "playing" | "lost" | "won" | "error"
  >("loading");
  const [commitment, setCommitment] = useState("0x…");
  const [proofs, setProofs] = useState(0);
  const [pending, setPending] = useState<
    | "loading-artifacts"
    | "preloading"
    | "proving"
    | "verifying"
    | null
  >(null);

  // Board state lives in refs, not React state: no React devtools leakage.
  const boardRef = useRef<number[] | null>(null);
  const saltRef = useRef<string | null>(null);
  const commitRef = useRef<string | null>(null);

  const inert = status !== "playing" || pending !== null;
  const flagsUsed = cells.filter((c) => c.flagged).length;

  const applyCells = (cells: CellReveal[]) =>
    setCells((prev) => {
      const next = prev.slice();
      for (const cell of cells) {
        next[cell.r * N + cell.c] = {
          revealed: true,
          count: cell.count,
          mine: cell.isMine,
          proving: false,
          flagged: false,
        };
      }
      return next;
    });

  const markProving = (cells: CellReveal[]) =>
    setCells((prev) => {
      const next = prev.slice();
      for (const cell of cells) {
        const i = cell.r * N + cell.c;
        next[i] = { ...next[i], proving: true };
      }
      return next;
    });

  const clearProving = () =>
    setCells((prev) =>
      prev.map((c) => (c.proving ? { ...c, proving: false } : c)),
    );

  const newGame = useCallback(async () => {
    setStatus("loading");
    setProofs(0);
    setPending(null);
    setCells(blank());
    try {
      // Generate board + salt + commitment locally — no server, no API call.
      const board = genBoard();
      const salt = randSalt();
      const comm = poseidon2Hash2(
        packBoard(board),
        BigInt(salt),
      ).toString();
      boardRef.current = board;
      saltRef.current = salt;
      commitRef.current = comm;
      setCommitment(shortHex(comm));

      // Load artifacts + preload prover
      await ensureWasm();
      setPending("loading-artifacts");
      const { xbc, pk } = await loadProvingArtifacts();
      setPending("preloading");
      preload(xbc, pk);

      // Opening reveal: prove + verify the center cell (guaranteed safe)
      setPending("proving");
      const r = Math.floor(CENTER / N);
      const c = CENTER % N;
      const opening = await proveCells(board, salt, comm, [
        { r, c, count: neighbourCount(board, r, c) },
      ]);
      setPending("verifying");
      if (!(await verify(opening, comm)))
        throw new Error("opening proof invalid");
      applyCells(opening.cells);
      setProofs(1);
      setPending(null);
      setStatus("playing");
    } catch {
      clearProving();
      setPending(null);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    newGame();
  }, [newGame]);

  useEffect(() => {
    if (status !== "playing") return;
    const safe = cells.reduce(
      (n, c) => n + (c.revealed && !c.mine ? 1 : 0),
      0,
    );
    if (safe === SAFE) setStatus("won");
  }, [cells, status]);

  const open = useCallback(
    async (idx: number) => {
      if (
        status !== "playing" ||
        pending !== null ||
        cells[idx].revealed ||
        cells[idx].flagged
      )
        return;
      const board = boardRef.current!;
      const salt = saltRef.current!;
      const comm = commitRef.current!;
      const r = Math.floor(idx / N);
      const c = idx % N;

      setPending("proving");
      markProving([{ r, c, isMine: false, count: 0 }]);
      try {
        // Flood locally, then prove + verify
        const flooded = floodCells(board, r, c);
        const rs = await proveCells(board, salt, comm, flooded);
        setPending("verifying");
        markProving(rs.cells);
        if (await verify(rs, comm)) {
          applyCells(rs.cells);
          setProofs((p) => p + 1);
          if (rs.cells.some((cell) => cell.isMine)) setStatus("lost");
        } else {
          clearProving();
        }
      } catch {
        clearProving();
      } finally {
        setPending(null);
      }
    },
    [status, pending, cells],
  );

  const toggleFlag = useCallback(
    (idx: number) => {
      if (status !== "playing" || pending !== null) return;
      setCells((prev) => {
        if (prev[idx].revealed) return prev;
        if (!prev[idx].flagged) {
          const used = prev.reduce((n, c) => n + (c.flagged ? 1 : 0), 0);
          if (used >= MINES) return prev;
        }
        const next = prev.slice();
        next[idx] = { ...next[idx], flagged: !next[idx].flagged };
        return next;
      });
    },
    [status, pending],
  );

  const isResult = status === "lost" || status === "won";

  return (
    <motion.div
      className={"xk-demo xk-ms" + (isResult ? " is-result" : "")}
      animate={{
        x: status === "lost" ? SHAKE : 0,
        backgroundColor: isResult ? "#99ff00" : "#0b0b0b",
        borderColor: isResult ? "#99ff00" : "#1c1c1c",
        color: isResult ? "#0a0a0a" : "#ffffff",
      }}
      transition={{
        x: { duration: 0.45, ease: smooth },
        backgroundColor: { duration: isResult ? 0.4 : 0, ease: smooth },
        borderColor: { duration: isResult ? 0.4 : 0, ease: smooth },
        color: { duration: isResult ? 0.4 : 0, ease: smooth },
      }}
    >
      <div className="xk-demo-head">
        <span>minesweeper.rs</span>
        <span className="xk-lock">
          <span className="xk-dot" /> BOARD COMMITTED
        </span>
      </div>

      <AnimatePresence mode="wait">
        {isResult ? (
          <motion.div
            key="result"
            className="xk-demo-body"
            variants={bodyVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="xk-result">
              {status === "won" ? "Cleared." : "Mine."}
            </div>
            <div className="xk-prow">
              <span className="k">cells opened</span>
              <span className="v">{proofs}</span>
            </div>
            <div className="xk-prow">
              <span className="k">commitment</span>
              <span className="v">{commitment}</span>
            </div>
            <div className="xk-prow">
              <span className="k">groth16 proofs</span>
              <span className="v">{proofs} verified ✓</span>
            </div>
            <div className="xk-prow">
              <span className="k">the board</span>
              <span className="v">
                <span className="xk-scell" />
                never revealed
              </span>
            </div>
            <div className="xk-pcap">
              You played a board you <b>couldn{"'"}t see</b>, against a house that{" "}
              <b>couldn{"'"}t move a mine</b> or lie about a cell. Every reveal was
              a zero-knowledge proof.
            </div>
            <div className="xk-result-actions">
              <a
                className="xk-btn-outline"
                href="/docs/learn-zk/01-what-is-a-zk-proof"
              >
                Verify yourself
              </a>
              <button type="button" className="xk-btn-dark" onClick={newGame}>
                New board
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="play"
            className="xk-demo-body"
            variants={bodyVariants}
            initial={false}
            animate="animate"
            exit="exit"
          >
            <div className="xk-commit-row">
              <span className="lbl">Commitment</span>
              <span className="val">{commitment}</span>
            </div>

            <div
              className={inert ? "xk-ms-grid is-busy" : "xk-ms-grid"}
              aria-label="minesweeper board"
            >
              {cells.map((cell, idx) => {
                const cls = [
                  "xk-ms-cell",
                  cell.revealed ? "open" : "hidden",
                  cell.proving ? "proving" : "",
                  cell.mine ? "mine" : "",
                  cell.flagged ? "flagged" : "",
                  cell.revealed && !cell.mine && cell.count > 0
                    ? `n${cell.count}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={idx}
                    className={cls}
                    onClick={() => open(idx)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      toggleFlag(idx);
                    }}
                    disabled={inert || cell.revealed}
                    aria-label={`cell ${Math.floor(idx / N)},${idx % N}`}
                  >
                    {cell.revealed && cell.mine ? (
                      <span className="xk-ms-bomb" />
                    ) : cell.revealed && cell.count > 0 ? (
                      cell.count
                    ) : cell.flagged ? (
                      <span className="xk-ms-flag" />
                    ) : (
                      ""
                    )}
                  </button>
                );
              })}
            </div>

            <div className="xk-ms-foot">
              <span
                className={
                  pending === "verifying"
                    ? "xk-ms-msg is-pending"
                    : "xk-ms-msg"
                }
              >
                {status === "loading"
                  ? "Committing a board…"
                  : pending === "loading-artifacts"
                    ? "Loading prover…"
                    : pending === "preloading"
                      ? "Preparing circuit…"
                      : pending === "proving"
                        ? "Generating proof…"
                        : pending === "verifying"
                          ? "Verifying proof…"
                          : status === "error"
                            ? "Prover unavailable."
                            : "Proving locally in your browser."}
              </span>
              {status === "error" ? (
                <button className="xk-ms-reset" onClick={newGame}>
                  retry
                </button>
              ) : (
                <span className="xk-ms-proofs">
                  <span className="xk-ms-flags">⚑ {MINES - flagsUsed}</span>
                  {proofs} proof{proofs === 1 ? "" : "s"} ✓
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
