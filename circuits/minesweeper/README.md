# minesweeper circuit

The ZK-minesweeper circuit behind the landing demo, written as a `#![no_std]`
Rust crate for the current xark toolchain (Rust → MIR → R1CS → Groth16). The
9×9 board (`0` = safe, `1` = mine) packs into one field element and is committed
as `hash2(packed, salt)` (Poseidon2). Given a public cell `(r, c)` the circuit
constrains `(commitment, is_mine, count)` against the committed board — proving
that one cell's value while revealing nothing about any other cell. 5 public
inputs, ~2.5k R1CS constraints.

The prover (server) supplies **every** public value — `commitment`, `is_mine`
and `count` included — and the circuit asserts each is correct. The verifier
(browser) reads those values back out of the proof's public signals, so the
house cannot move a mine or lie about a cell, and unopened cells stay hidden.

## How the demo uses it

- The board + salt live server-side (`lib/minesweeper.ts`); the
  `/api/minesweeper/*` routes shell out to `xark prove`, which solves the
  witness **and** produces the Groth16 proof in one call (no separate `nargo`
  step — xark lowers Rust directly to R1CS).
- `lib/poseidon2.ts` is a TypeScript port of the `xark-poseidon2` gadget, so the
  server can compute the same commitment the circuit constrains and pass it as a
  public input.
- The browser verifies each proof with snarkjs against the committed
  `verification_key.json` before revealing the cell, and checks the commitment
  stays constant across reveals.

Every reveal proves against the same commitment, so the house can't move a mine
or lie about a cell, and unopened cells stay hidden.

## Setup (once)

`xark build` compiles the circuit; `xark setup` generates the Groth16 keys. The
server runs both lazily on first use (cached under `target/xark/minesweeper/`),
but you can regenerate the keys that match the committed `verification_key.json`
deterministically:

```sh
xark build circuits/minesweeper
xark setup circuits/minesweeper --insecure-dev-mode --deterministic-rng 42
# the browser verifies with this file:
cp circuits/minesweeper/target/xark/minesweeper/snarkjs-verification_key.json \
   circuits/minesweeper/verification_key.json
```

These are dev keys — forgeable, never for production; a real deployment runs
`xark ceremony`. The prover needs `xark` on PATH (and the pinned nightly it
drives) and a **Node runtime** (not a Cloudflare Worker).
