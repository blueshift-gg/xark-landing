import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { poseidon2Hash2 } from "./poseidon2";

// Server-only. Holds each game's secret board + salt and produces a real Groth16
// proof per revealed cell. Proving runs **in-memory** via `@blueshift-gg/xark-wasm`
// — no CLI shell-out per cell, no temp files, no lock. The one-time `xark build`
// and `xark setup` (producing R1CS + keys) still run as a subprocess, but only
// once, lazily, cached on disk. The browser verifies each proof; the board never
// leaves this process.

const exec = promisify(execFile);

const CIRCUIT_DIR = path.join(process.cwd(), "circuits", "minesweeper");
const OUT_DIR = path.join(CIRCUIT_DIR, "target", "xark", "minesweeper");
const XARK = path.join(os.homedir(), ".cargo", "bin", "xark");

// BN254 scalar field modulus (for packing the board into one field element).
const P =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const N = 9;
const CELLS = N * N;
const MINES = 10;
const CENTER = Math.floor(CELLS / 2); // (4,4)

export type Game = { board: number[]; salt: string };

// Persist across dev HMR / module reloads so in-flight games survive edits
// (in-memory is fine for a single-instance demo).
const games: Map<string, Game> =
  (globalThis as unknown as { __msGames?: Map<string, Game> }).__msGames ??
  new Map<string, Game>();
(globalThis as unknown as { __msGames?: Map<string, Game> }).__msGames = games;

// ---- WASM prover (in-memory, no CLI shell-out per cell) ---------------------

type WasmProveFn = (
  r1csJson: string,
  circuitJson: string,
  pkBytes: Uint8Array,
  inputsJson: string,
) => {
  proof: Uint8Array;
  publicInputs: Uint8Array;
  snarkjsProof: string;
  snarkjsPublic: string;
  numPublicInputs: number;
};

let __wasmProve: WasmProveFn | null = null;
let __artifacts: { r1cs: string; circuit: string; pk: Uint8Array } | null = null;

let readyPromise: Promise<void> | null = null;
async function ensureReady(): Promise<void> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    // 1. Ensure circuit artifacts exist (one-time build + setup, cached on disk).
    const hasAll =
      (await exists(path.join(OUT_DIR, "pk.bin"))) &&
      (await exists(path.join(OUT_DIR, "r1cs.json"))) &&
      (await exists(path.join(OUT_DIR, "circuit.json")));
    if (!hasAll) {
      await exec(XARK, ["build", CIRCUIT_DIR], { maxBuffer: 1 << 26 });
      await exec(
        XARK,
        ["setup", CIRCUIT_DIR, "--insecure-dev-mode", "--deterministic-rng", "42"],
        { maxBuffer: 1 << 26 },
      );
    }

    // 2. Load artifacts into memory once.
    const [r1cs, circuit, pk] = await Promise.all([
      fs.readFile(path.join(OUT_DIR, "r1cs.json"), "utf8"),
      fs.readFile(path.join(OUT_DIR, "circuit.json"), "utf8"),
      fs.readFile(path.join(OUT_DIR, "pk.bin")),
    ]);
    __artifacts = { r1cs, circuit, pk: new Uint8Array(pk) };

    // 3. Initialise the WASM module.
    const wasmPath = path.join(
      process.cwd(),
      "node_modules",
      "@blueshift-gg",
      "xark-wasm",
      "xark_wasm_bg.wasm",
    );
    const wasmBytes = new Uint8Array(await fs.readFile(wasmPath));
    const mod = await import("@blueshift-gg/xark-wasm");
    await mod.default({ module_or_path: wasmBytes });
    __wasmProve = mod.prove as WasmProveFn;
  })().catch((e) => {
    readyPromise = null; // allow retry on next request
    throw e;
  });
  return readyPromise;
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(() => true, () => false);
}

// ---- board helpers ----------------------------------------------------------

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

// Pack the board into a single field element (board[0] + board[1]·2 + …), the
// same packing the circuit commits to.
function packBoard(board: number[]): bigint {
  let packed = 0n;
  let pow = 1n;
  for (let i = 0; i < CELLS; i++) {
    packed += BigInt(board[i]) * pow;
    pow <<= 1n;
  }
  return packed % P;
}

// ---- proving ----------------------------------------------------------------

export type Reveal = {
  r: number;
  c: number;
  isMine: boolean;
  count: number;
  commitment: string;
  proof: unknown;
  publicSignals: string[];
};

export async function proveCell(
  board: number[],
  salt: string,
  r: number,
  c: number,
): Promise<Reveal> {
  await ensureReady();
  const { r1cs, circuit, pk } = __artifacts!;
  const prove = __wasmProve!;

  // The prover supplies every public value; the circuit asserts each. We
  // still read them back out of `snarkjsPublic` below so the returned
  // values are exactly the proof's public signals.
  const packed = packBoard(board);
  const commitment = poseidon2Hash2(packed, BigInt(salt));
  const isMine = board[r * N + c];
  const count = neighbourCount(board, r, c);

  const inputs: Record<string, string> = {};
  for (let i = 0; i < CELLS; i++) inputs[`board[${i}]`] = String(board[i]);
  inputs.salt = salt;
  inputs.r = String(r);
  inputs.c = String(c);
  inputs.commitment = commitment.toString();
  inputs.is_mine = String(isMine);
  inputs.count = String(count);

  const result = prove(r1cs, circuit, pk, JSON.stringify(inputs));
  // public inputs order (from `xark inspect`): [r, c, commitment, is_mine, count]
  const publicSignals = JSON.parse(result.snarkjsPublic) as string[];
  return {
    r,
    c,
    isMine: publicSignals[3] === "1",
    count: Number(publicSignals[4]),
    commitment: publicSignals[2],
    proof: JSON.parse(result.snarkjsProof),
    publicSignals,
  };
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

// ---- flood-fill -------------------------------------------------------------

export function floodCells(board: number[], r: number, c: number): [number, number][] {
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

// ---- game lifecycle ---------------------------------------------------------

export function getGame(id: string): Game | undefined {
  return games.get(id);
}

export async function newGame() {
  const board = genBoard();
  const salt = randSalt();
  const id = randomUUID();
  games.set(id, { board, salt });
  // Prove the guaranteed-safe centre as the opening move — this also establishes
  // the commitment the player checks stays constant across every later reveal.
  const center = await proveCell(board, salt, Math.floor(CENTER / N), CENTER % N);
  return { id, commitment: center.commitment, center };
}
