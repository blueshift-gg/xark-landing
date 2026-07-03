import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

// Server-only. Holds each game's secret board + salt and produces a real Groth16
// proof per revealed cell by shelling out to nargo (witness) and the xark CLI
// (prove). The browser verifies the proof; the board never leaves this process.

const exec = promisify(execFile);

const CIRCUIT_DIR = path.join(process.cwd(), "circuits", "minesweeper");
const GROTH16 = path.join(CIRCUIT_DIR, "target", "groth16");
const NARGO = path.join(os.homedir(), ".nargo", "bin", "nargo");
const XARK = path.join(os.homedir(), ".cargo", "bin", "xark");

export const N = 9;
const CELLS = N * N;
const MINES = 10;
const CENTER = Math.floor(CELLS / 2); // (4,4)

type Game = { board: number[]; salt: string };
const games = new Map<string, Game>();

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

async function prove(
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

export async function newGame() {
  const board = genBoard();
  const salt = randSalt();
  const id = randomUUID();
  games.set(id, { board, salt });
  // Prove the guaranteed-safe centre as the opening move — this also establishes
  // the commitment the player checks stays constant across every later reveal.
  const center = await prove(board, salt, Math.floor(CENTER / N), CENTER % N);
  return { id, commitment: center.commitment, center };
}

export async function revealCell(id: string, r: number, c: number): Promise<Reveal> {
  const game = games.get(id);
  if (!game) throw new Error("unknown or expired game");
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= N || c < 0 || c >= N) {
    throw new Error("cell out of range");
  }
  return prove(game.board, game.salt, r, c);
}
