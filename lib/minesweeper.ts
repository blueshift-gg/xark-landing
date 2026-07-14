import { randomBytes } from "node:crypto";

import { preload, prove_preloaded } from "@blueshift-gg/xark-wasm";

import { sealGame } from "./game-token";
import {
  CELLS,
  MINES,
  N,
  type CellReveal,
  type RevealSet,
} from "./minesweeper-shared";
import { poseidon2Hash2 } from "./poseidon2";

export { N } from "./minesweeper-shared";

// Circuit artifacts — embedded as Uint8Array literals (generated from the real
// circuit.xbc + pk.bin by scripts/gen-artifacts.mjs) so the module is fully
// self-contained: no filesystem and no runtime fetch, which matters on workerd
// where the prover runs. circuit.xbc is the single self-contained build
// artifact; the wasm derives both the witness solver and the minimized R1CS
// from it, so no r1cs.json/circuit.json are needed.
import { xbcBytes as XBC } from "../circuits/minesweeper/artifacts/xbc";
import { pkBytes as PK } from "../circuits/minesweeper/artifacts/pk";

// Parse the circuit.xbc + pk.bin once per instance and reuse it across reveals.
// prove() re-expands the .xbc on every call; preload() + prove_preloaded skip
// that (and the R1CS minimize), leaving just the witness solve + Groth16 prove
// per reveal. The first call on a cold instance pays preload() once. Safe
// without locking: preload() is a synchronous wasm call, so the guard block
// can't be interleaved on the single-threaded event loop.
//
// prove_preloaded doesn't self-verify (like snarkjs/arkworks): the browser
// verifies every proof (xark-wasm verify + the committed vk) before flipping
// any cell, so the verifier at the point of consumption is the security
// boundary — a server-side self-verify would be redundant work on the hot path.
let warmed = false;

const CENTER = Math.floor(CELLS / 2); // (4,4)

// ── board helpers ───────────────────────────────────────────────────────────

function randSalt(): string {
  return BigInt("0x" + randomBytes(31).toString("hex")).toString();
}

// Uniform index in [0, CELLS) from the platform CSPRNG. Rejection-samples the
// top of the byte range so 81 divides evenly (no modulo bias) — the board is
// the committed secret, so it must not come from a predictable `Math.random`.
function randIndex(): number {
  const limit = 256 - (256 % CELLS); // 243 = 3 * 81
  let b: number;
  do {
    b = randomBytes(1)[0];
  } while (b >= limit);
  return b % CELLS;
}

function genBoard(): number[] {
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

// Bit-pack the board into one field element, matching the circuit. 81 bits fit
// far under the BN254 modulus, so no reduction is needed.
function packBoard(board: number[]): bigint {
  let packed = 0n;
  let pow = 1n;
  for (let i = 0; i < CELLS; i++) {
    packed += BigInt(board[i]) * pow;
    pow <<= 1n;
  }
  return packed;
}

function neighbourCount(board: number[], r: number, c: number): number {
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

// ── flood-fill ──────────────────────────────────────────────────────────────

// A flood cell carries its neighbour-mine `count` so `proveRevealSet` doesn't
// recompute it — one source of truth for the count that gates the proof.
export type FloodCell = { r: number; c: number; count: number };

export function floodCells(
  board: number[],
  r: number,
  c: number,
): FloodCell[] {
  if (board[r * N + c] === 1) return [{ r, c, count: neighbourCount(board, r, c) }];
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

// ── prove a reveal set (one proof for any number of cells) ──────────────────

export async function proveRevealSet(
  board: number[],
  salt: string,
  cells: FloodCell[],
  commitment: string,
): Promise<RevealSet> {
  // Build circuit inputs + return data in a single pass over the cells. The
  // neighbour count arrives with each flood cell — no recompute here.
  const revealed = new Array<number>(CELLS).fill(0);
  const isMine = new Array<number>(CELLS).fill(0);
  const count = new Array<number>(CELLS).fill(0);
  const cellReveals: CellReveal[] = [];

  for (const { r, c, count: nc } of cells) {
    const i = r * N + c;
    revealed[i] = 1;
    isMine[i] = board[i];
    count[i] = nc;
    cellReveals.push({ r, c, isMine: board[i] === 1, count: nc });
  }

  const inputs: Record<string, string> = {};
  for (let i = 0; i < CELLS; i++) inputs[`board[${i}]`] = String(board[i]);
  inputs.salt = salt;
  inputs.commitment = commitment;
  for (let i = 0; i < CELLS; i++) inputs[`revealed[${i}]`] = String(revealed[i]);
  for (let i = 0; i < CELLS; i++) inputs[`is_mine[${i}]`] = String(isMine[i]);
  for (let i = 0; i < CELLS; i++) inputs[`count[${i}]`] = String(count[i]);

  if (!warmed) {
    preload(XBC, PK);
    warmed = true;
  }
  const { proof, publicInputs }: { proof: Uint8Array; publicInputs: Uint8Array } =
    prove_preloaded(JSON.stringify(inputs));

  return {
    proof: proof.toBase64(),
    publicInputs: publicInputs.toBase64(),
    cells: cellReveals,
  };
}

// ── game lifecycle ──────────────────────────────────────────────────────────

export async function newGame() {
  const board = genBoard();
  const salt = randSalt();
  const commitment = poseidon2Hash2(packBoard(board), BigInt(salt)).toString();
  const id = await sealGame({ board, salt, commitment });
  // Opening reveal: the center cell only (forced safe by `genBoard`).
  const r = Math.floor(CENTER / N);
  const c = CENTER % N;
  const reveal = await proveRevealSet(
    board,
    salt,
    [{ r, c, count: neighbourCount(board, r, c) }],
    commitment,
  );
  return { id, commitment, reveal };
}
