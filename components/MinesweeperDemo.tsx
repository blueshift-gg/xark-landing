"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { keyHash, vkBytes } from "@/circuits/minesweeper/artifacts/vk";
import {
  Cell,
  Minesweeper,
  type MinesweeperVerifier,
} from "@/circuits/minesweeper/artifacts/minesweeper";
import {
  CELLS,
  CENTER,
  MINES,
  N,
  SAFE,
  type FromHouse,
  type Request,
  type ToHouse,
} from "@/lib/minesweeper-shared";

import { smooth } from "@/utils/easings";

// ── constants ───────────────────────────────────────────────────────────────

const SHAKE = [0, -10, 10, -7, 7, -4, 4, 0];

/** A shown cell's neighbour count, by its `Cell` variant. */
const COUNT: Partial<Record<Cell, number>> = {
  Clear: 0, One: 1, Two: 2, Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8,
};

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

/** A proof's SHA-256, in hex: a name for it the player can compare. */
async function proofHash(proof: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", proof as BufferSource);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A cell's place, as a person reads it: 1-based. */
function place(idx: number): string {
  return `row ${Math.floor(idx / N) + 1}, column ${(idx % N) + 1}`;
}

/** What a screen reader says for a cell: where it is and what it shows. */
function cellLabel(cell: CellState, idx: number): string {
  const what = cell.proving
    ? "proving"
    : cell.revealed && cell.mine
      ? "mine"
      : cell.revealed
        ? cell.count === 0
          ? "no mines nearby"
          : `${cell.count} ${cell.count === 1 ? "mine" : "mines"} nearby`
        : cell.flagged
          ? "flagged"
          : "hidden";
  return `${place(idx)}: ${what}`;
}

// ── the player's verifier ───────────────────────────────────────────────────

let verifier: Promise<MinesweeperVerifier> | null = null;
/** The verifier, made once: it refuses any verifying key but the one `xark setup` made. */
function loadVerifier(): Promise<MinesweeperVerifier> {
  verifier ??= Minesweeper.verifier(vkBytes, { keyHash });
  verifier.catch(() => (verifier = null));
  return verifier;
}

/** The house's worker, and its answers by request. */
type House = { worker: Worker; ask: (msg: Request) => Promise<FromHouse> };

function startHouse(): House {
  const worker = new Worker(
    new URL("../lib/minesweeper.worker.ts", import.meta.url),
  );
  const waiting = new Map<number, (msg: FromHouse) => void>();
  let next = 0;
  worker.onmessage = (e: MessageEvent<FromHouse>) => {
    waiting.get(e.data.id)?.(e.data);
    waiting.delete(e.data.id);
  };
  worker.onerror = (e) => {
    for (const [id, answer] of waiting) answer({ id, type: "error", message: e.message });
    waiting.clear();
  };
  return {
    worker,
    ask: (msg) =>
      new Promise((resolve) => {
        const id = next++;
        waiting.set(id, resolve);
        worker.postMessage({ id, ...msg } satisfies ToHouse);
      }),
  };
}

/**
 * Whether `proof` proves the house shows `view` of the board it committed to.
 * The verifier encodes `commitment` and `view` itself, so a verified proof is
 * bound to exactly what the page then renders.
 */
async function verifyReveal(
  proof: Uint8Array,
  commitment: string,
  view: Cell[],
): Promise<boolean> {
  const v = await loadVerifier();
  return v.verify(proof, { commitment, view });
}

// ── component ───────────────────────────────────────────────────────────────

export function MinesweeperDemo() {
  const [cells, setCells] = useState<CellState[]>(blank);
  const [status, setStatus] = useState<
    "loading" | "playing" | "lost" | "won" | "error"
  >("loading");
  const [commitment, setCommitment] = useState("0x…");
  const [proofs, setProofs] = useState(0);
  const [pending, setPending] = useState<"proving" | "verifying" | null>(null);
  // The last verified proof: its hash, and how long the house took to prove it.
  const [lastProof, setLastProof] = useState<{ hash: string; ms: number } | null>(
    null,
  );
  // What the live region last announced: each proof's verdict.
  const [said, setSaid] = useState("");
  // The one cell in the tab order (a roving tabindex); arrows move it.
  const [focusIdx, setFocusIdx] = useState(CENTER);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const newBoardRef = useRef<HTMLButtonElement | null>(null);

  // The board itself never reaches the page: it lives in the house's worker.
  // The page keeps only the commitment every proof must verify against.
  const houseRef = useRef<House | null>(null);
  const commitRef = useRef<string | null>(null);
  // Bumped by each new game, so an answer about an older board is dropped.
  const gameRef = useRef(0);

  const inert = status !== "playing" || pending !== null;
  const flagsUsed = cells.filter((c) => c.flagged).length;

  /** Show every cell `view` opens. */
  const applyView = (view: Cell[]) =>
    setCells((prev) =>
      prev.map((cell, i) =>
        view[i] === Cell.Hidden
          ? { ...cell, proving: false }
          : {
              revealed: true,
              count: COUNT[view[i]] ?? 0,
              mine: view[i] === Cell.Mine,
              proving: false,
              flagged: false,
            },
      ),
    );

  const markProving = (idx: number) =>
    setCells((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], proving: true };
      return next;
    });

  const clearProving = () =>
    setCells((prev) =>
      prev.map((c) => (c.proving ? { ...c, proving: false } : c)),
    );

  /**
   * Ask the house to open `cell` (or start a board), and accept the answer only
   * if its proof verifies against the commitment and it opens that cell: the
   * view it showed, `"rejected"`, or `null` for an answer about an older board.
   */
  const play = useCallback(
    async (house: House, req: Request): Promise<Cell[] | "rejected" | null> => {
      const game = gameRef.current;
      setPending("proving");
      const answer = await house.ask(req);
      if (game !== gameRef.current) return null;
      if (answer.type === "error") throw new Error(answer.message);
      if (answer.type === "board") {
        commitRef.current = answer.commitment;
        setCommitment(shortHex(answer.commitment));
      }
      const cell = answer.type === "reveal" ? answer.cell : CENTER;
      setPending("verifying");
      const ok =
        answer.view[cell] !== Cell.Hidden &&
        (await verifyReveal(answer.proof, commitRef.current!, answer.view));
      if (game !== gameRef.current) return null;
      setPending(null);
      if (!ok) return "rejected";
      const hash = await proofHash(answer.proof);
      if (game !== gameRef.current) return null;
      setLastProof({ hash, ms: answer.ms });
      setProofs((p) => p + 1);
      applyView(answer.view);
      return answer.view;
    },
    [],
  );

  const newGame = useCallback(async () => {
    const house = houseRef.current;
    if (!house) return;
    const game = ++gameRef.current;
    commitRef.current = null;
    setStatus("loading");
    setProofs(0);
    setLastProof(null);
    setPending(null);
    setCells(blank());
    setCommitment("0x…");
    try {
      // The house commits to a board and proves the opening reveal: the
      // centre, guaranteed safe.
      const view = await play(house, { type: "new" });
      if (game !== gameRef.current) return;
      if (view !== "rejected" && view !== null) {
        setStatus("playing");
        setSaid("New board committed. The centre is open, and its proof verified.");
      } else throw new Error("opening proof invalid");
    } catch (err) {
      if (game !== gameRef.current) return;
      console.error("minesweeper:", err);
      clearProving();
      setPending(null);
      setStatus("error");
      setSaid("Prover unavailable.");
    }
  }, [play]);

  useEffect(() => {
    const house = startHouse();
    houseRef.current = house;
    newGame();
    return () => {
      house.worker.terminate();
      houseRef.current = null;
      gameRef.current++;
    };
  }, [newGame]);

  useEffect(() => {
    if (status !== "playing") return;
    const safe = cells.reduce(
      (n, c) => n + (c.revealed && !c.mine ? 1 : 0),
      0,
    );
    if (safe === SAFE) {
      setStatus("won");
      setSaid(`Board cleared. ${proofs} proofs verified.`);
    }
  }, [cells, status, proofs]);

  const open = useCallback(
    async (idx: number) => {
      const house = houseRef.current;
      if (
        !house ||
        status !== "playing" ||
        pending !== null ||
        cells[idx].revealed ||
        cells[idx].flagged
      )
        return;
      markProving(idx);
      try {
        const view = await play(house, { type: "open", cell: idx });
        if (view === null) return;
        if (view === "rejected") {
          clearProving();
          setSaid(`The proof for ${place(idx)} didn't verify, so it stays hidden.`);
        } else if (view.includes(Cell.Mine)) {
          setStatus("lost");
          setSaid(`Proof verified: ${place(idx)} is a mine. Game over.`);
        } else {
          const opened = view.filter((c, i) => c !== Cell.Hidden && !cells[i].revealed).length;
          setSaid(`Proof verified: ${opened} ${opened === 1 ? "cell" : "cells"} opened.`);
        }
      } catch (err) {
        console.error("minesweeper:", err);
        clearProving();
        setPending(null);
        setSaid("The prover failed, so the cell stays hidden.");
      }
    },
    [status, pending, cells, play],
  );

  /** Arrow keys move along the board; `F` flags the focused cell. */
  const onGridKey = (e: KeyboardEvent, idx: number) => {
    const r = Math.floor(idx / N);
    const c = idx % N;
    const to = {
      ArrowUp: r > 0 ? idx - N : idx,
      ArrowDown: r < N - 1 ? idx + N : idx,
      ArrowLeft: c > 0 ? idx - 1 : idx,
      ArrowRight: c < N - 1 ? idx + 1 : idx,
      Home: r * N,
      End: r * N + N - 1,
    }[e.key];
    if (to !== undefined) {
      e.preventDefault();
      setFocusIdx(to);
      cellRefs.current[to]?.focus();
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      toggleFlag(idx);
    }
  };

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

      <p className="xk-sr" role="status" aria-live="polite">
        {said}
      </p>

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
              <button
                type="button"
                className="xk-btn-dark"
                onClick={newGame}
                // The board, and the cell that had focus, are gone: keep the
                // keyboard where play goes next.
                ref={(el) => el?.focus({ preventScroll: true })}
              >
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
              role="group"
              aria-label="Minesweeper board, 9 by 9"
              aria-describedby="xk-ms-keys"
              aria-busy={pending !== null}
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
                // Not `disabled`: a disabled button can't hold focus, so the
                // keyboard would lose its place each time a cell opens.
                return (
                  <button
                    key={idx}
                    type="button"
                    ref={(el) => {
                      cellRefs.current[idx] = el;
                    }}
                    className={cls}
                    tabIndex={idx === focusIdx ? 0 : -1}
                    onFocus={() => setFocusIdx(idx)}
                    onKeyDown={(e) => onGridKey(e, idx)}
                    onClick={() => open(idx)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      toggleFlag(idx);
                    }}
                    aria-disabled={inert || cell.revealed}
                    aria-label={cellLabel(cell, idx)}
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

            <div className="xk-commit-row xk-proof-row">
              <span className="lbl">Proof {proofs > 0 ? `#${proofs}` : ""}</span>
              <span className="val" title={lastProof?.hash}>
                {lastProof
                  ? `${lastProof.hash.slice(0, 8)}…${lastProof.hash.slice(-8)} · ${Math.round(lastProof.ms)} ms`
                  : "—"}
              </span>
            </div>

            <p id="xk-ms-keys" className="xk-sr">
              Arrow keys move between cells, Enter opens one, F flags it.
            </p>

            <div className="xk-ms-foot">
              <span
                className={
                  pending === "verifying"
                    ? "xk-ms-msg is-pending"
                    : "xk-ms-msg"
                }
              >
                {status === "error"
                  ? "Prover unavailable."
                  : status === "loading" && pending !== "verifying"
                    ? "Committing a board…"
                    : pending === "proving"
                      ? "Generating proof…"
                      : pending === "verifying"
                        ? "Verifying proof…"
                        : lastProof !== null
                          ? "Proved and verified in your browser."
                          : "Proving locally in your browser."}
              </span>
              {status === "error" ? (
                <button type="button" className="xk-ms-reset" onClick={newGame}>
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
