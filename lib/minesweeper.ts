import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

// Server-only. Holds each game's secret board + salt and produces a real Groth16
// proof per revealed cell by shelling out to nargo (witness) and the xark CLI
// (prove). The browser verifies each proof; the board never leaves this process.

const exec = promisify(execFile);

const CIRCUIT_DIR = path.join(process.cwd(), "circuits", "minesweeper");
const GROTH16 = path.join(CIRCUIT_DIR, "target", "groth16");
const NARGO = path.join(os.homedir(), ".nargo", "bin", "nargo");
const XARK = path.join(os.homedir(), ".cargo", "bin", "xark");

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

// The prover shares one Prover.toml + target dir, so serialize access.
let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

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
  return withLock(async () => {
    const toml =
      `salt = "${salt}"\nr = "${r}"\nc = "${c}"\n` +
      `board = [${board.map((v) => `"${v}"`).join(", ")}]\n`;
    await fs.writeFile(path.join(CIRCUIT_DIR, "Prover.toml"), toml);
    await exec(NARGO, ["execute"], { cwd: CIRCUIT_DIR });
    await exec(XARK, ["prove"], { cwd: CIRCUIT_DIR });
    const [proofRaw, pubRaw] = await Promise.all([
      fs.readFile(path.join(GROTH16, "snarkjs-proof.json"), "utf8"),
      fs.readFile(path.join(GROTH16, "snarkjs-public.json"), "utf8"),
    ]);
    // public inputs order (from `xark inspect`): [r, c, commitment, is_mine, count]
    const publicSignals = JSON.parse(pubRaw) as string[];
    return {
      r,
      c,
      isMine: publicSignals[3] === "1",
      count: Number(publicSignals[4]),
      commitment: publicSignals[2],
      proof: JSON.parse(proofRaw),
      publicSignals,
    };
  });
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

// The cells a click opens: a mine is just itself; otherwise classic flood through
// the connected zero-region and its border. Mines are never included.
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
  const id = randomUUID();
  games.set(id, { board, salt });
  // Prove the guaranteed-safe centre as the opening move — this also establishes
  // the commitment the player checks stays constant across every later reveal.
  const center = await proveCell(board, salt, Math.floor(CENTER / N), CENTER % N);
  return { id, commitment: center.commitment, center };
}
