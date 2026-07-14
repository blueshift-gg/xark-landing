// Shared constants + wire types for the ZK-minesweeper flow. Imported by both
// the server prover (`lib/minesweeper.ts`) and the client
// (`components/MinesweeperDemo.tsx`), so the board geometry and the JSON shape
// crossing `/api/minesweeper` can't drift. No `node:crypto` here — safe to
// import from the client bundle.

export const N = 9;
export const CELLS = N * N; // 81
export const MINES = 10;
export const SAFE = CELLS - MINES;

// One opened cell: its neighbour-mine `count` and whether it `isMine`.
export type CellReveal = { r: number; c: number; isMine: boolean; count: number };

// The `/reveal` (and per-reveal `/new`) payload: one Groth16 proof covering
// every cell it opens. `proof` + `publicInputs` are the canonical compressed
// bytes from xark-wasm, base64-encoded for JSON transport. The committed board
// hash travels once, top-level, in the `/new` response — it is also
// `publicInputs[0]`, which the client re-derives and checks.
export type RevealSet = {
  proof: string;
  publicInputs: string;
  cells: CellReveal[];
};
