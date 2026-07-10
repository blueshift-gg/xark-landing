import { randomBytes } from "node:crypto";

import { preload, prove_fast } from "@blueshift-gg/xark-wasm";

import { sealGame, type SealedGame } from "./game-token";
import { poseidon2Hash2 } from "./poseidon2";

// Circuit artifacts — imported at build time as static data so the Worker
// never touches a filesystem. r1cs.json / circuit.json are parsed by webpack
// on import, so we re-stringify for prove(). pk is a base64 TS constant.
import r1csParsed from "../circuits/minesweeper/artifacts/r1cs.json";
import circuitParsed from "../circuits/minesweeper/artifacts/circuit.json";
import { pkBytes } from "../circuits/minesweeper/artifacts/pk";

const R1CS = JSON.stringify(r1csParsed);
const CIRCUIT = JSON.stringify(circuitParsed);
const PK = pkBytes();

// Parse the ~2.5 MB R1CS/CIRCUIT JSON + pk once per instance and reuse it
// across reveals. `prove()` re-deserializes on every call (~191 ms); caching
// it drops warm reveals from ~294 ms to ~103 ms (prove_fast). The first call
// on a cold instance pays preload() once — identical to a single prove() —
// so cold starts are unchanged. Safe without locking: preload() is a
// synchronous wasm call, so the guard block can't be interleaved on the
// single-threaded event loop.
let warmed = false;

const P =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const N = 9;
const CELLS = N * N;
const MINES = 10;
const CENTER = Math.floor(CELLS / 2); // (4,4)

// ── board helpers ───────────────────────────────────────────────────────────

function randSalt(): string {
  return BigInt("0x" + randomBytes(31).toString("hex")).toString();
}

function genBoard(): number[] {
  const board = new Array<number>(CELLS).fill(0);
  let placed = 0;
  while (placed < MINES) {
    const i = Math.floor(Math.random() * CELLS);
    if (board[i] || i === CENTER) continue;
    board[i] = 1;
    placed++;
  }
  return board;
}

function packBoard(board: number[]): bigint {
  let packed = 0n;
  let pow = 1n;
  for (let i = 0; i < CELLS; i++) {
    packed += BigInt(board[i]) * pow;
    pow <<= 1n;
  }
  return packed % P;
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

export function floodCells(
  board: number[],
  r: number,
  c: number,
): [number, number][] {
  if (board[r * N + c] === 1) return [[r, c]];
  const seen = new Set<number>();
  const out: [number, number][] = [];
  const stack: [number, number][] = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop()!;
    if (cr < 0 || cr >= N || cc < 0 || cc >= N) continue;
    const idx = cr * N + cc;
    if (seen.has(idx) || board[idx] === 1) continue;
    seen.add(idx);
    out.push([cr, cc]);
    if (neighbourCount(board, cr, cc) === 0) {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if (dr || dc) stack.push([cr + dr, cc + dc]);
    }
  }
  return out;
}

// ── prove a reveal set (one proof for any number of cells) ──────────────────

export type CellReveal = { r: number; c: number; isMine: boolean; count: number };

export type RevealSet = {
  commitment: string;
  proof: unknown;
  publicSignals: string[];
  cells: CellReveal[];
};

export async function proveRevealSet(
  board: number[],
  salt: string,
  cells: [number, number][],
  commitment: string,
): Promise<RevealSet> {
  // Build circuit inputs + return data in a single pass over the cells.
  const revealed = new Array<number>(CELLS).fill(0);
  const isMine = new Array<number>(CELLS).fill(0);
  const count = new Array<number>(CELLS).fill(0);
  const cellReveals: CellReveal[] = [];

  for (const [r, c] of cells) {
    const i = r * N + c;
    const nc = neighbourCount(board, r, c);
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
    preload(R1CS, CIRCUIT, PK);
    warmed = true;
  }
  const result: { snarkjsProof: string; snarkjsPublic: string } = prove_fast(
    JSON.stringify(inputs),
  );

  return {
    commitment,
    proof: JSON.parse(result.snarkjsProof),
    publicSignals: JSON.parse(result.snarkjsPublic),
    cells: cellReveals,
  };
}

// ── game lifecycle ──────────────────────────────────────────────────────────

export async function newGame() {
  const board = genBoard();
  const salt = randSalt();
  const commitment = poseidon2Hash2(packBoard(board), BigInt(salt)).toString();
  const id = await sealGame({ board, salt, commitment });
  const reveal = await proveRevealSet(
    board,
    salt,
    [[Math.floor(CENTER / N), CENTER % N]],
    commitment,
  );
  return { id, commitment, reveal };
}
