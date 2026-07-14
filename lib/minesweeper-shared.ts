// Shared constants, types, core board logic, and public-input encoder for the
// ZK-minesweeper flow. Imported by the client prover + verifier
// (`components/MinesweeperDemo.tsx`). No `node:crypto`, no wasm — pure JS with
// Web Crypto for randomness, safe in the browser.

export const N = 9;
export const CELLS = N * N; // 81
export const MINES = 10;
export const SAFE = CELLS - MINES;

// Public-input layout of the reveal circuit, in declaration order:
//   [commitment, revealed[0..80], is_mine[0..80], count[0..80]]  (244 values)
export const NUM_PUBLIC_INPUTS = 1 + 3 * CELLS; // 244

/** Centre cell index — guaranteed safe by {@link genBoard}. */
export const CENTER = Math.floor(CELLS / 2); // (4,4)

// ── board generation (crypto-safe, browser-native) ─────────────────────────

/** Uniform random index in [0, CELLS). Rejection-sampled from one random byte. */
function randIndex(): number {
  const limit = 256 - (256 % CELLS); // 243
  let b: number;
  do {
    b = crypto.getRandomValues(new Uint8Array(1))[0];
  } while (b >= limit);
  return b % CELLS;
}

/** Generate a fresh board with MINES mines, centre guaranteed safe. */
export function genBoard(): number[] {
  const board = new Array<number>(CELLS).fill(0);
  let placed = 0;
  while (placed < MINES) {
    const i = randIndex();
    if (board[i] || i === CENTER) continue;
    board[i] = 1;
    placed++;
  }
  return board;
}

/** Random salt — 31 bytes to stay safely under the BN254 modulus. */
export function randSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(31));
  return BigInt("0x" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")).toString();
}

// ── types ───────────────────────────────────────────────────────────────────

/** One opened cell: its neighbour-mine `count` and whether it `isMine`. */
export type CellReveal = { r: number; c: number; isMine: boolean; count: number };

/**
 * The reveal payload: one Groth16 proof and the cells it opens. The client
 * reconstructs the circuit's 244 public inputs locally via
 * {@link encodePublicInputs} and verifies the proof against those bytes, so
 * the server never ships public-input bytes (~10KB).
 */
export type RevealSet = {
  proof: string; // base64 canonical Groth16 proof (128 B → 172 base64 chars)
  cells: CellReveal[];
};

/** A flood cell carries its neighbour count so the prover doesn't recompute it. */
export type FloodCell = { r: number; c: number; count: number };

// ── board helpers (shared) ──────────────────────────────────────────────────

/** Bit-pack the board into one field element, matching the circuit. 81 bits
 *  fit far under the BN254 modulus — no reduction needed. */
export function packBoard(board: number[]): bigint {
  let packed = 0n;
  let pow = 1n;
  for (let i = 0; i < CELLS; i++) {
    packed += BigInt(board[i]) * pow;
    pow <<= 1n;
  }
  return packed;
}

/** Count neighbouring mines for cell (r,c). */
export function neighbourCount(
  board: number[],
  r: number,
  c: number,
): number {
  let n = 0;
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < N && cc >= 0 && cc < N && board[rr * N + cc] === 1) n++;
    }
  return n;
}

// ── flood-fill───────────────────────────────────────────────────────────────

/**
 * Flood-fill from (r,c). If the cell is a mine, returns just that cell.
 * Each returned cell carries its pre-computed neighbour count so the prover
 * can reuse it without a second sweep.
 */
export function floodCells(
  board: number[],
  r: number,
  c: number,
): FloodCell[] {
  if (board[r * N + c] === 1)
    return [{ r, c, count: neighbourCount(board, r, c) }];
  const seen = new Set<number>();
  const out: FloodCell[] = [];
  const stack: [number, number][] = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop()!;
    if (cr < 0 || cr >= N || cc < 0 || cc >= N) continue;
    const idx = cr * N + cc;
    if (seen.has(idx) || board[idx] === 1) continue;
    seen.add(idx);
    const nc = neighbourCount(board, cr, cc);
    out.push({ r: cr, c: cc, count: nc });
    if (nc === 0) {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if (dr || dc) stack.push([cr + dr, cc + dc]);
    }
  }
  return out;
}

// ── public-input encoder ────────────────────────────────────────────────────

/**
 * Serialize the circuit's public inputs to the exact canonical bytes
 * xark-wasm produces: a u64 little-endian element count, then each field
 * element as 32 little-endian bytes, in declaration order. Deriving these
 * from the committed board hash + the opened cells (rather than trusting
 * server-sent bytes) is what binds a verified proof to what we render.
 */
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
  new DataView(out.buffer).setUint32(0, NUM_PUBLIC_INPUTS, true);
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
