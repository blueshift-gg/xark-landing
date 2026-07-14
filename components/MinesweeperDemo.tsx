"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import init, { verify as wasmVerify } from "@blueshift-gg/xark-wasm";
import { vkBytes } from "@/circuits/minesweeper/artifacts/vk";
import {
  CELLS,
  MINES,
  N,
  SAFE,
  encodePublicInputs,
  type CellReveal,
  type RevealSet,
} from "@/lib/minesweeper-shared";
// Always the in-process WASM prover (/api/minesweeper). No external prover.
const PROVER = "/api/minesweeper";

import { smooth } from "@/utils/easings";

// The honest ZK minesweeper. The board + salt live server-side; each click comes
// back as ONE real Groth16 proof (xark WASM) covering every cell the reveal
// opens (a single cell, a flood fill, or a mine) against the committed board.
// Each proof is verified here in the browser with xark-wasm before the cells
// flip — so "proofs: N" is N real verifications (one per click), unopened cells
// are cells nobody proved, and the commitment is checked constant across reveals.

const SHAKE = [0, -10, 10, -7, 7, -4, 4, 0];

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

// Instantiate the xark-wasm verifier once in the browser (pkg-web build →
// fetches xark_wasm_bg.wasm on first use), then verify each proof against the
// committed verifying key. Everything is binary: proof + publicInputs are the
// canonical compressed bytes from the server, vk.bin is embedded here.
const VK = vkBytes;
let wasmReady: Promise<unknown> | null = null;
function ensureWasm(): Promise<unknown> {
  if (!wasmReady) wasmReady = init();
  return wasmReady;
}

// Verify a reveal against the committed board. The server sends only the
// 128-byte proof; we reconstruct the circuit's public inputs locally from the
// committed board hash and the cells the server claims it opened, then verify
// the proof against *those* bytes. So a valid proof is accepted only if it
// proves exactly the statement we're about to render — a dishonest server can't
// pair a valid proof with fabricated cells, and there's nothing to compare
// (the reconstructed inputs *are* what we verify against).
async function verify(rs: RevealSet, committed: string): Promise<boolean> {
  await ensureWasm();
  const publicInputs = encodePublicInputs(committed, rs.cells);
  return wasmVerify(VK, Uint8Array.fromBase64(rs.proof), publicInputs);
}

export function MinesweeperDemo() {
  const [cells, setCells] = useState<CellState[]>(blank);
  const [status, setStatus] = useState<
    "loading" | "playing" | "lost" | "won" | "error"
  >("loading");
  const [commitment, setCommitment] = useState("0x…");
  const [proofs, setProofs] = useState(0);
  const [pending, setPending] = useState<"proving" | "verifying" | null>(null);
  const idRef = useRef<string | null>(null);
  const commitRef = useRef<string | null>(null);
  // The board is non-interactive unless it's the player's turn and idle.
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

  // Mark cells whose proof has arrived but not yet verified, so they pulse
  // (the `.proving` class) — the "received, pending verification" signal.
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
    setCells((prev) => prev.map((c) => (c.proving ? { ...c, proving: false } : c)));

  const newGame = useCallback(async () => {
    setStatus("loading");
    setProofs(0);
    setPending(null);
    setCells(blank());
    try {
      const j = await (
        await fetch(`${PROVER}/new`, { method: "POST" })
      ).json();
      if (j.error) throw new Error(j.error);
      idRef.current = j.id;
      commitRef.current = j.commitment;
      setCommitment(shortHex(j.commitment));
      markProving(j.reveal.cells);
      setPending("verifying");
      if (!(await verify(j.reveal, j.commitment)))
        throw new Error("opening proof invalid");
      applyCells(j.reveal.cells);
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
    const safe = cells.reduce((n, c) => n + (c.revealed && !c.mine ? 1 : 0), 0);
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
      setPending("proving");
      markProving([
        { r: Math.floor(idx / N), c: idx % N, isMine: false, count: 0 },
      ]);
      try {
        const res = await fetch(`${PROVER}/reveal`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: idRef.current,
            r: Math.floor(idx / N),
            c: idx % N,
          }),
        });
        if (!res.ok) throw new Error("reveal failed");
        const rs: RevealSet = await res.json();
        setPending("verifying");
        markProving(rs.cells);
        if (commitRef.current && (await verify(rs, commitRef.current))) {
          applyCells(rs.cells);
          setProofs((p) => p + 1);
          if (rs.cells.some((cell) => cell.isMine)) setStatus("lost");
        } else {
          clearProving(); // verify failed or public inputs didn't match
        }
      } catch {
        clearProving(); // keep the board; a transient failure shouldn't wipe progress
      } finally {
        setPending(null);
      }
    },
    [status, pending, cells],
  );

  // Right-click toggles a flag so the player can mark suspected mines. A
  // flagged cell can't be opened by left-click (no-op) and is excluded from
  // the press animation, so the edge-click fix never bites on it.
  const toggleFlag = useCallback(
    (idx: number) => {
      if (status !== "playing" || pending !== null) return;
      setCells((prev) => {
        if (prev[idx].revealed) return prev;
        // Only MINES flags exist; cap there so the counter can't go negative.
        // Unflagging is always allowed so a used flag can be moved elsewhere.
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
              <a className="xk-btn-outline" href="/docs/learn-zk/01-what-is-a-zk-proof">
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
                  pending === "verifying" ? "xk-ms-msg is-pending" : "xk-ms-msg"
                }
              >
                {status === "loading"
                  ? "Committing a board…"
                  : pending === "proving"
                    ? "Generating proof…"
                    : pending === "verifying"
                      ? "Verifying proof…"
                      : status === "error"
                        ? "Prover unavailable."
                        : "Each cell is a proof, verified in your browser."}
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
