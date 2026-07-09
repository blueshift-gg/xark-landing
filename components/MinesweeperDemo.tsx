"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import vkey from "@/circuits/minesweeper/verification_key.json";
import { smooth } from "@/utils/easings";

// The honest ZK minesweeper. The board + salt live server-side; every opened
// cell comes back as a real Groth16 proof (xark CLI) that the cell opens to this
// value against the committed board. Each proof is verified here with snarkjs
// before the cell flips — so "proofs: N" is N real verifications, unopened cells
// are cells nobody proved, and the commitment is checked constant across reveals.

const N = 9;
const CELLS = 81;
const MINES = 10;
const SAFE = CELLS - MINES;
const SHAKE = [0, -10, 10, -7, 7, -4, 4, 0];

type Reveal = {
  r: number;
  c: number;
  isMine: boolean;
  count: number;
  commitment: string;
  proof: unknown;
  publicSignals: string[];
};
type CellState = { revealed: boolean; count: number; mine: boolean };

const blank = (): CellState[] =>
  Array.from({ length: CELLS }, () => ({ revealed: false, count: 0, mine: false }));

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

async function verify(rv: Reveal): Promise<boolean> {
  const snarkjs = await import("snarkjs");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return snarkjs.groth16.verify(vkey as any, rv.publicSignals, rv.proof as any);
}

export function MinesweeperDemo() {
  const [cells, setCells] = useState<CellState[]>(blank);
  const [status, setStatus] = useState<
    "loading" | "playing" | "lost" | "won" | "error"
  >("loading");
  const [commitment, setCommitment] = useState("0x…");
  const [proofs, setProofs] = useState(0);
  const [busy, setBusy] = useState(false);
  const idRef = useRef<string | null>(null);
  const commitRef = useRef<string | null>(null);

  const applyAll = (reveals: Reveal[]) =>
    setCells((prev) => {
      const next = prev.slice();
      for (const rv of reveals) {
        next[rv.r * N + rv.c] = {
          revealed: true,
          count: rv.count,
          mine: rv.isMine,
        };
      }
      return next;
    });

  const newGame = useCallback(async () => {
    setStatus("loading");
    setProofs(0);
    setBusy(false);
    setCells(blank());
    try {
      const j = await (
        await fetch("/api/minesweeper/new", { method: "POST" })
      ).json();
      if (j.error) throw new Error(j.error);
      idRef.current = j.id;
      commitRef.current = j.commitment;
      setCommitment(shortHex(j.commitment));
      if (!(await verify(j.center))) throw new Error("opening proof invalid");
      applyAll([j.center]);
      setProofs(1);
      setStatus("playing");
    } catch {
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
      if (status !== "playing" || busy || cells[idx].revealed) return;
      setBusy(true);
      let hitMine = false;
      try {
        const res = await fetch("/api/minesweeper/reveal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: idRef.current,
            r: Math.floor(idx / N),
            c: idx % N,
          }),
        });
        if (!res.ok || !res.body) throw new Error("reveal failed");
        // Read the NDJSON stream: each line is one cell's proof. Verify and
        // reveal it as it arrives, so the region cascades open and the counter
        // ticks live.
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let rv: Reveal;
            try {
              rv = JSON.parse(line);
            } catch {
              continue;
            }
            if (!(await verify(rv)) || rv.commitment !== commitRef.current) {
              continue;
            }
            applyAll([rv]);
            setProofs((p) => p + 1);
            if (rv.isMine) hitMine = true;
          }
        }
        if (hitMine) setStatus("lost");
      } catch {
        // keep the board; a transient failure shouldn't wipe progress
      } finally {
        setBusy(false);
      }
    },
    [status, busy, cells],
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
              className={busy ? "xk-ms-grid is-busy" : "xk-ms-grid"}
              aria-label="minesweeper board"
            >
              {cells.map((cell, idx) => {
                const cls = [
                  "xk-ms-cell",
                  cell.revealed ? "open" : "hidden",
                  cell.mine ? "mine" : "",
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
                    disabled={status !== "playing" || cell.revealed || busy}
                    aria-label={`cell ${Math.floor(idx / N)},${idx % N}`}
                  >
                    {cell.revealed && cell.mine ? (
                      <span className="xk-ms-bomb" />
                    ) : cell.revealed && cell.count > 0 ? (
                      cell.count
                    ) : (
                      ""
                    )}
                  </button>
                );
              })}
            </div>

            <div className="xk-ms-foot">
              <span className="xk-ms-msg">
                {status === "loading"
                  ? "Committing a board…"
                  : busy
                    ? "Proving + verifying…"
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
