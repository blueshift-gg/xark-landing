// End-to-end check of the demo's artifacts, in Node: the house proves reveals with
// the embedded circuit and key, the player's verifier (pinned to the key's hash)
// accepts them, and refuses a tampered proof, a tampered reveal, another
// commitment, and a house that lies. `pnpm check:minesweeper` (Node ≥ 26 runs
// the TypeScript as is).
import assert from "node:assert/strict";

import { Board, Cell, CheckFailed, Field, Minesweeper } from "../circuits/minesweeper/artifacts/minesweeper.ts";
import { clientWasmBytes } from "../circuits/minesweeper/artifacts/client-wasm.ts";
import { pkBytes } from "../circuits/minesweeper/artifacts/pk.ts";
import { keyHash, vkBytes } from "../circuits/minesweeper/artifacts/vk.ts";
import { sources, xbcBytes } from "../circuits/minesweeper/artifacts/xbc.ts";

const at = (r: number, c: number) => r * 9 + c;
const time = <T>(f: () => T): [T, number] => {
  const t = performance.now();
  const out = f();
  return [out, performance.now() - t];
};

let t = performance.now();
const prover = await Minesweeper.prover(
  { circuit: xbcBytes, provingKey: pkBytes, sources, client: clientWasmBytes },
  { digest: Minesweeper.digest },
);
prover.preload();
const verifier = await Minesweeper.verifier(vkBytes, { keyHash });
console.log(`load: prover (digest-pinned, key preloaded) + verifier (key-pinned) in ${(performance.now() - t).toFixed(0)} ms`);

// Mines at (0,0), (0,1), (8,8) and (5,2).
const mines = Array.from({ length: 81 }, (_, i) => [at(0, 0), at(0, 1), at(8, 8), at(5, 2)].includes(i));
const board = { mines, salt: new Field(crypto.getRandomValues(new Uint8Array(31))) };
const commitment = Board.commitment(board);

// A flood from the centre, a single cell, and a mine.
for (const [what, cell] of [["flood from (4,4)", at(4, 4)], ["single cell (1,0)", at(1, 0)], ["mine (5,2)", at(5, 2)]] as const) {
  const view = Board.reveal(board, cell);
  const [proof, prove] = time(() => prover.prove({ board, commitment, view }));
  const bytes = proof.toBytesCompressed();
  const [ok, verify] = time(() => verifier.verify(bytes, { commitment, view }));
  assert.equal(ok, true, what);
  assert.notEqual(view[cell], Cell.Hidden);
  const shown = view.filter((c) => c !== Cell.Hidden).length;
  console.log(`${what}: ${shown} cells shown, proved in ${prove.toFixed(1)} ms, verified in ${verify.toFixed(1)} ms`);
}

// Steady-state proving time.
const view = Board.reveal(board, at(4, 4));
const runs = 20;
t = performance.now();
for (let i = 0; i < runs; i++) prover.prove({ board, commitment, view });
console.log(`prove: ${((performance.now() - t) / runs).toFixed(1)} ms mean over ${runs} (one thread)`);

const proof = prover.prove({ board, commitment, view }).toBytesCompressed();
assert.equal(verifier.verify(proof, { commitment, view }), true);

// A flipped proof byte.
const flipped = proof.slice();
flipped[10] ^= 1;
assert.equal(verifier.verify(flipped, { commitment, view }), false, "tampered proof");

// A reveal that isn't the one proved: one count changed, a hidden cell shown.
const lie = view.slice();
lie[at(1, 1)] = lie[at(1, 1)] === Cell.Two ? Cell.Three : Cell.Two;
assert.equal(verifier.verify(proof, { commitment, view: lie }), false, "tampered count");
const peek = view.slice();
peek[at(0, 0)] = Cell.Mine;
assert.equal(verifier.verify(proof, { commitment, view: peek }), false, "tampered hidden cell");

// Another board's commitment.
const other = Board.commitment({ mines, salt: new Field(1n) });
assert.equal(verifier.verify(proof, { commitment: other, view }), false, "another commitment");

// A house that lies can't prove: a wrong count, a mine shown as safe.
assert.throws(() => prover.prove({ board, commitment, view: lie }), CheckFailed);
const safe = Board.reveal(board, at(5, 2));
safe[at(5, 2)] = Cell.One;
assert.throws(() => prover.prove({ board, commitment, view: safe }), CheckFailed);

// Pinning: another key or circuit is refused.
await assert.rejects(Minesweeper.verifier(vkBytes, { keyHash: "00".repeat(32) }));
await assert.rejects(
  Minesweeper.prover({ circuit: xbcBytes, provingKey: pkBytes }, { digest: "0".repeat(32) }),
);

console.log("ok: valid reveals verify; a tampered proof, reveal or commitment, a lying house and an unpinned key are all refused");
