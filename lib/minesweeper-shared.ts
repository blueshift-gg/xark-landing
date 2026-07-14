// Shared constants + wire types for the ZK-minesweeper flow. Imported by both
// the server prover (`lib/minesweeper.ts`) and the client
// (`components/MinesweeperDemo.tsx`), so the board geometry and the JSON shape
// crossing `/api/minesweeper` can't drift. No `node:crypto` here — safe to
// import from the client bundle.

export const N = 9;
export const CELLS = N * N; // 81
export const MINES = 10;
export const SAFE = CELLS - MINES;

// Public-input layout of the reveal circuit, in declaration order:
//   [commitment, revealed[0..80], is_mine[0..80], count[0..80]]  (244 values)
export const NUM_PUBLIC_INPUTS = 1 + 3 * CELLS; // 244

// One opened cell: its neighbour-mine `count` and whether it `isMine`.
export type CellReveal = { r: number; c: number; isMine: boolean; count: number };

// The `/reveal` (and per-reveal `/new`) payload: one Groth16 proof covering
// every cell it opens. Only the 128-byte `proof` crosses the wire, base64-
// encoded — the client reconstructs the (244-element) public inputs locally
// with `encodePublicInputs` and verifies against them, so we don't ship ~10KB
// of public-input bytes that the client can already derive.
export type RevealSet = {
  proof: string;
  cells: CellReveal[];
};

// Serialize the circuit's public inputs to the exact canonical bytes xark-wasm
// produces: a u64 little-endian element count, then each field element as 32
// little-endian bytes, in declaration order. Deriving these from the committed
// board hash + the opened cells (rather than trusting server-sent bytes) is
// what binds a verified proof to what we render.
export function encodePublicInputs(
  commitment: string,
  cells: CellReveal[],
): Uint8Array {
  const els = new Array<bigint>(NUM_PUBLIC_INPUTS).fill(0n);
  els[0] = BigInt(commitment);
  const REVEALED = 1;
  const IS_MINE = 1 + CELLS;
  const COUNT = 1 + 2 * CELLS;
  for (const { r, c, isMine, count } of cells) {
    const i = r * N + c;
    els[REVEALED + i] = 1n;
    els[IS_MINE + i] = isMine ? 1n : 0n;
    els[COUNT + i] = BigInt(count);
  }

  const out = new Uint8Array(8 + NUM_PUBLIC_INPUTS * 32);
  new DataView(out.buffer).setUint32(0, NUM_PUBLIC_INPUTS, true); // u64 LE (low word; count < 2^32)
  for (let k = 0; k < NUM_PUBLIC_INPUTS; k++) {
    let x = els[k];
    const base = 8 + k * 32;
    for (let b = 0; b < 32; b++) {
      out[base + b] = Number(x & 0xffn);
      x >>= 8n;
    }
  }
  return out;
}
