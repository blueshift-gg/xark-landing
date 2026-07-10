import { randomBytes, randomUUID } from "node:crypto";

import { prove } from "@blueshift-gg/xark-wasm";

import { poseidon2Hash2 } from "./poseidon2";

// Circuit artifacts — imported at build time as static data so the Worker
// never touches a filesystem (no readFileSync for JSON / pk). When these
// imports fail at build time, run `pnpm setup` to regenerate the artifacts.
// r1cs.json and circuit.json are parsed JSON → re-stringified for prove().
import r1csParsed from "../circuits/minesweeper/artifacts/r1cs.json";
import circuitParsed from "../circuits/minesweeper/artifacts/circuit.json";
import { pkBytes } from "../circuits/minesweeper/artifacts/pk";

// Packaged artefacts (pre-built by `pnpm setup`), cached at first prove().
const R1CS = JSON.stringify(r1csParsed);
const CIRCUIT = JSON.stringify(circuitParsed);
const PK = pkBytes();

// Server-only. Holds each game's secret board + salt and produces a real Groth16
// proof for a whole reveal (a single cell, a flood fill, or a mine click) in one
// shot using the xark WASM prover — fully in-process, with no CLI or external
// prover at runtime. The circuit artifacts are imported as static data (Cloudflare
// Workers can't `readFileSync`). The browser re-verifies each proof with snarkjs;
// the board never leaves this process.

// BN254 scalar field modulus (for packing the board into one field element).
const P =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const N = 9;
const CELLS = N * N;
const MINES = 10;
const CENTER = Math.floor(CELLS / 2); // (4,4)

export type Game = { board: number[]; salt: string; commitment: string };

// Persist across dev HMR / module reloads so in-flight games survive edits.
const games: Map<string, Game> =
  (globalThis as unknown as { __msGames?: Map<string, Game> }).__msGames ??
  new Map<string, Game>();
(globalThis as unknown as { __msGames?: Map<string, Game> }).__msGames = games;

// pkg-node auto-inits on import in Node. pkg-web auto-inits on import in
// Workers (static `import wasmModule` + `initSync(wasmModule)` call).
let ready: Promise<void> | null = null;
async function ensureReady(): Promise<void> {
  if (ready) return ready;
  ready = Promise.resolve();
  return ready;
}

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
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < N && cc >= 0 && cc < N && board[rr * N + cc] === 1) n++;
    }
  }
  return n;
}

// ── prove a reveal set (one proof for any number of cells) ──────────────────

export type CellReveal = { r: number; c: number; isMine: boolean; count: number };

export type RevealSet = {
  commitment: string;
  proof: unknown; // snarkjs proof object
  publicSignals: string[];
  cells: CellReveal[];
};

export async function proveRevealSet(
  board: number[],
  salt: string,
  cells: [number, number][],
  commitment?: string,
): Promise<RevealSet> {
  await ensureReady();

  const comm = commitment ??
    poseidon2Hash2(packBoard(board), BigInt(salt)).toString();

  // Build the public reveal bitmask + per-cell is_mine / count. Hidden cells
  // are left 0 — the circuit forces them to 0 too (no leak of nearby counts).
  const revealed = new Array<number>(CELLS).fill(0);
  const isMine = new Array<number>(CELLS).fill(0);
  const count = new Array<number>(CELLS).fill(0);
  for (const [r, c] of cells) {
    const i = r * N + c;
    revealed[i] = 1;
    isMine[i] = board[i];
    count[i] = neighbourCount(board, r, c);
  }

  const inputs: Record<string, string> = {};
  for (let i = 0; i < CELLS; i++) inputs[`board[${i}]`] = String(board[i]);
  inputs.salt = salt;
  inputs.commitment = comm;
  for (let i = 0; i < CELLS; i++) inputs[`revealed[${i}]`] = String(revealed[i]);
  for (let i = 0; i < CELLS; i++) inputs[`is_mine[${i}]`] = String(isMine[i]);
  for (let i = 0; i < CELLS; i++) inputs[`count[${i}]`] = String(count[i]);

  // prove() returns { snarkjsProof, snarkjsPublic, ... } and self-verifies
  // (throws if the witness is unsatisfiable or the proof fails to verify).
  const result: {
    snarkjsProof: string;
    snarkjsPublic: string;
  } = prove(R1CS, CIRCUIT, PK, JSON.stringify(inputs));

  return {
    commitment: comm,
    proof: JSON.parse(result.snarkjsProof),
    publicSignals: JSON.parse(result.snarkjsPublic),
    cells: cells.map(([r, c]) => ({
      r,
      c,
      isMine: board[r * N + c] === 1,
      count: neighbourCount(board, r, c),
    })),
  };
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
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr || dc) stack.push([cr + dr, cc + dc]);
        }
      }
    }
  }
  return out;
}

export function getGame(id: string): Game | undefined {
  return games.get(id);
}

export async function newGame() {
  const board = genBoard();
  const salt = randSalt();
  const id = randomUUID();
  const commitment = poseidon2Hash2(packBoard(board), BigInt(salt)).toString();
  games.set(id, { board, salt, commitment });
  const reveal = await proveRevealSet(board, salt, [
    [Math.floor(CENTER / N), CENTER % N],
  ], commitment);
  return { id, commitment: reveal.commitment, reveal };
}
