import { poseidon2Hash2 } from "./poseidon2";
import r1csObj from "@/circuits/minesweeper/artifacts/r1cs.json";
import circuitObj from "@/circuits/minesweeper/artifacts/circuit.json";
import { decodePk } from "@/circuits/minesweeper/artifacts/pk";
import { decodeWasm } from "@/vendor/xark-wasm/wasm";

// Server-only. Holds each game's secret board + salt and produces a real Groth16
// proof per revealed cell. Proving runs **in-memory** via the vendored WASM.
// Workers: Wrangler pre-compiles `.wasm` imports into WebAssembly.Module.
// Node/webpack dev: decode from base64 and compile at runtime.

// BN254 scalar field modulus (for packing the board into one field element).
const P =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const N = 9;
const CELLS = N * N;
const MINES = 10;
const CENTER = Math.floor(CELLS / 2); // (4,4)

export type Game = { board: number[]; salt: string };

const games: Map<string, Game> =
  (globalThis as unknown as { __msGames?: Map<string, Game> }).__msGames ??
  new Map<string, Game>();
(globalThis as unknown as { __msGames?: Map<string, Game> }).__msGames = games;

// ---- WASM prover ------------------------------------------------------------

type WasmProveFastFn = (
  inputsJson: string,
) => {
  proof: Uint8Array;
  publicInputs: Uint8Array;
  snarkjsProof: string;
  snarkjsPublic: string;
  numPublicInputs: number;
};

let __wasmProveFast: WasmProveFastFn | null = null;

let readyPromise: Promise<void> | null = null;
async function ensureReady(): Promise<void> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    const r1csJson = JSON.stringify(r1csObj);
    const circuitJson = JSON.stringify(circuitObj);
    const pkBytes = decodePk();

    // WASM module: Wrangler pre-compiles `.wasm` imports at deploy time and
    // exposes via globalThis.__XARK_WASM (see scripts/patch-wasm.mjs). In dev,
    // fall back to base64 bytes + WebAssembly.compile.
    let wasmModule: WebAssembly.Module;
    const precompiled = (globalThis as Record<string, unknown>).__XARK_WASM as
      | WebAssembly.Module
      | undefined;
    if (precompiled) {
      wasmModule = precompiled;
    } else {
      wasmModule = await WebAssembly.compile(decodeWasm() as BufferSource);
    }

    const wasm = await import("@/vendor/xark-wasm/xark_wasm.js");
    wasm.initSync({ module: wasmModule });
    wasm.preload(r1csJson, circuitJson, pkBytes);
    __wasmProveFast = wasm.prove_fast as WasmProveFastFn;
  })().catch((e) => {
    readyPromise = null;
    throw e;
  });
  return readyPromise;
}

// ---- board helpers ----------------------------------------------------------

function randSalt(): string {
  const buf = new Uint8Array(31);
  crypto.getRandomValues(buf);
  let hex = "";
  for (const b of buf) hex += b.toString(16).padStart(2, "0");
  return BigInt("0x" + hex).toString();
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
  const proveFast = __wasmProveFast!;

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

  const result = proveFast(JSON.stringify(inputs));
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

export function getGame(id: string): Game | undefined {
  return games.get(id);
}

export async function newGame() {
  const board = genBoard();
  const salt = randSalt();
  const id = crypto.randomUUID();
  games.set(id, { board, salt });
  const center = await proveCell(board, salt, Math.floor(CENTER / N), CENTER % N);
  return { id, commitment: center.commitment, center };
}
