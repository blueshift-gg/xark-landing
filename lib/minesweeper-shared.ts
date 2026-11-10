// The board's shape, the house's random board, and the messages between the page
// and the house's Web Worker (`lib/minesweeper.worker.ts`). What a reveal shows
// (the flood fill) and the commitment are the circuit crate's own Rust
// (`Board.reveal`, `Board.commitment` in the generated client), not a copy here.

import type { Cell } from "@/circuits/minesweeper/artifacts/minesweeper";

export const N = 9;
export const CELLS = N * N; // 81
export const MINES = 10;
export const SAFE = CELLS - MINES;

/** Centre cell index: guaranteed safe by {@link genMines}. */
export const CENTER = Math.floor(CELLS / 2); // (4,4)

/** Uniform random index in [0, CELLS), rejection-sampled from one random byte. */
function randIndex(): number {
  const limit = 256 - (256 % CELLS); // 243
  let b: number;
  do {
    b = crypto.getRandomValues(new Uint8Array(1))[0];
  } while (b >= limit);
  return b % CELLS;
}

/** A fresh board's mines (`MINES` of them), the centre guaranteed safe. */
export function genMines(): boolean[] {
  const mines = new Array<boolean>(CELLS).fill(false);
  let placed = 0;
  while (placed < MINES) {
    const i = randIndex();
    if (mines[i] || i === CENTER) continue;
    mines[i] = true;
    placed++;
  }
  return mines;
}

/** A random salt: 31 bytes, so always below the BN254 modulus. */
export function randSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(31));
}

/** The page asks the house for a new board, or to open a cell. */
export type Request = { type: "new" } | { type: "open"; cell: number };

/** A request as posted: `id` pairs it with its answer. */
export type ToHouse = { id: number } & Request;

/**
 * The house answers with what it shows and the proof of it: `commitment` is
 * published once per board (decimal), and every proof is checked against it.
 * `proof` is the 128-byte compressed Groth16 proof; `ms` the proving time.
 */
export type FromHouse = { id: number } & (
  | {
      type: "board";
      commitment: string;
      view: Cell[];
      proof: Uint8Array;
      ms: number;
    }
  | { type: "reveal"; cell: number; view: Cell[]; proof: Uint8Array; ms: number }
  | { type: "error"; message: string }
);
