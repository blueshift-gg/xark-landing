"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import vkey from "@/circuits/minesweeper/verification_key.json";

// The honest ZK minesweeper. The board + salt live server-side; every cell you
// open comes back as a real Groth16 proof from the xark CLI that the cell opens
// to this value against the committed board. This component verifies each proof
// in the browser with snarkjs *before* revealing the cell — so a "proofs: N"
// tick is N real verifications, and an unopened cell is a cell nobody proved.

const N = 9;
const CELLS = 81;
const MINES = 10;
const SAFE = CELLS - MINES;

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

function shortHex(s: string): string {
  try {
    const h = BigInt(s).toString(16).padStart(4, "0");
    return `0x${h.slice(0, 4)}…${h.slice(-4)}`;
  } catch {
    return "0x…";
  }
}

async function verifyProof(publicSignals: string[], proof: unknown): Promise<boolean> {
  const snarkjs = await import("snarkjs");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return snarkjs.groth16.verify(vkey as any, publicSignals, proof as any);
}

export function MinesweeperDemo() {
  const [cells, setCells] = useState<CellState[]>(blank);
  const [status, setStatus] = useState<
    "loading" | "playing" | "lost" | "won" | "error"
  >("loading");
  const [commitment, setCommitment] = useState("0x…");
  const [proofs, setProofs] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const [shaking, setShaking] = useState(false);
  const idRef = useRef<string | null>(null);
  const commitRef = useRef<string | null>(null);
  const shakeT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = (rv: Reveal) =>
    setCells((prev) => {
      const next = prev.slice();
      next[rv.r * N + rv.c] = {
        revealed: true,
        count: rv.count,
        mine: rv.isMine,
      };
      return next;
    });

  const newGame = useCallback(async () => {
    setStatus("loading");
    setProofs(0);
    setShaking(false);
    setCells(blank());
    try {
      const j = await (
        await fetch("/api/minesweeper/new", { method: "POST" })
      ).json();
      if (j.error) throw new Error(j.error);
      idRef.current = j.id;
      commitRef.current = j.commitment;
      setCommitment(shortHex(j.commitment));
      if (!(await verifyProof(j.center.publicSignals, j.center.proof))) {
        throw new Error("opening proof failed to verify");
      }
      apply(j.center);
      setProofs(1);
      setStatus("playing");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    newGame();
    return () => {
      if (shakeT.current) clearTimeout(shakeT.current);
    };
  }, [newGame]);

  // win when every safe cell has been revealed
  useEffect(() => {
    if (status !== "playing") return;
    const safe = cells.reduce((n, c) => n + (c.revealed && !c.mine ? 1 : 0), 0);
    if (safe === SAFE) setStatus("won");
  }, [cells, status]);

  const open = useCallback(
    async (idx: number) => {
      if (status !== "playing" || busy !== null || cells[idx].revealed) return;
      const r = Math.floor(idx / N);
      const c = idx % N;
      setBusy(idx);
      try {
        const rv: Reveal = await (
          await fetch("/api/minesweeper/reveal", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: idRef.current, r, c }),
          })
        ).json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((rv as any).error) throw new Error((rv as any).error);
        const ok = await verifyProof(rv.publicSignals, rv.proof);
        // the commitment must be the same board we started against
        if (!ok || rv.commitment !== commitRef.current) {
          throw new Error("proof rejected");
        }
        apply(rv);
        setProofs((p) => p + 1);
        if (rv.isMine) {
          setStatus("lost");
          setShaking(true);
          if (shakeT.current) clearTimeout(shakeT.current);
          shakeT.current = setTimeout(() => setShaking(false), 450);
        }
      } catch {
        setStatus("error");
      } finally {
        setBusy(null);
      }
    },
    [status, busy, cells],
  );

  return (
    <div
      className={
        "xk-demo xk-ms" +
        (status === "won" ? " is-won" : "") +
        (shaking ? " is-shaking" : "")
      }
    >
      <div className="xk-demo-head">
        <span>minesweeper.nr</span>
        <span className="xk-lock">
          <span className="xk-dot" /> BOARD COMMITTED
        </span>
      </div>
      <div className="xk-demo-body">
        <div className="xk-commit-row">
          <span className="lbl">Commitment</span>
          <span className="val">{commitment}</span>
        </div>

        <div className="xk-ms-grid" aria-label="minesweeper board">
          {cells.map((cell, idx) => {
            const cls = [
              "xk-ms-cell",
              cell.revealed ? "open" : "hidden",
              cell.mine ? "mine" : "",
              busy === idx ? "proving" : "",
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
                disabled={
                  status !== "playing" || cell.revealed || busy !== null
                }
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
          {status === "loading" ? (
            <span className="xk-ms-msg">Committing a board…</span>
          ) : status === "playing" ? (
            <>
              <span className="xk-ms-msg">
                {busy !== null
                  ? "Proving + verifying this cell…"
                  : "Each cell is a proof, verified in your browser."}
              </span>
              <span className="xk-ms-proofs">
                {proofs} proof{proofs === 1 ? "" : "s"} ✓
              </span>
            </>
          ) : status === "lost" ? (
            <>
              <span className="xk-ms-msg">
                <span className="xk-lime">Mine.</span> Every reveal was verified
                — and the board never moved.
              </span>
              <button className="xk-ms-reset" onClick={newGame}>
                new board
              </button>
            </>
          ) : status === "won" ? (
            <>
              <span className="xk-ms-msg">
                <b>Cleared.</b> {proofs} proofs, one board you never saw.
              </span>
              <button className="xk-ms-reset" onClick={newGame}>
                new board
              </button>
            </>
          ) : (
            <>
              <span className="xk-ms-msg">Prover unavailable.</span>
              <button className="xk-ms-reset" onClick={newGame}>
                retry
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
