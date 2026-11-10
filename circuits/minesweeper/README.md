# minesweeper circuit

The zero-knowledge minesweeper circuit behind the landing demo, a Rust crate for
xark 0.3 (stable Rust → wasm32 → R1CS → Groth16 over BN254).

```rust
#[circuit]
pub fn minesweeper(board: Private<Board>, commitment: Public<Field>, view: Public<View>)
```

- `board` is the house's secret: 81 `mines` flags and a random `salt`.
- `commitment` is `hash2(packed, salt)` (Poseidon2), the 81 flags packed into one
  field element. The house publishes it before play; every proof is against it.
- `view` is what one reveal shows: per cell, a `Cell` that is `Hidden`, a neighbour
  count (`Clear`, `One` … `Eight`) or `Mine`.

The circuit checks that `board` hashes to `commitment`, and that every cell of `view`
is either `Hidden` or exactly what the board holds there. So one proof covers any
reveal: a single cell, a flood fill, or a mine. A hidden cell carries no value, so
nothing about it leaks. 484 constraints, 82 public inputs (`xark inspect`).

Each cell costs two rows. Its neighbour count is a sum over neighbours fixed at
compile time, so free; the true face is `1 + count`, or 10 for a mine (one row);
and `shown · (shown − truth) = 0` (one row) allows only hidden (0) or the truth,
which is never 0, so `view` needs no range check of its own.

The flood fill (`Board::reveal`) and the commitment (`Board::commitment`) are the
crate's Rust, in `#[input] impl Board`: the tests call them, and `xark client`
builds them into `client.wasm`, so the demo's TypeScript runs the same code
(`Board.reveal(board, cell)`) rather than a copy of it.

## Tests

```sh
xark test circuits/minesweeper
```

The tests call the circuit like a function: a flood fill, a single cell and a mine
prove; a wrong count, a mine shown as safe (or a safe cell as a mine), a moved mine
and another salt are refused.

## Artifacts

`pnpm run setup` (from the repository root) rebuilds everything the demo loads:

```sh
xark build circuits/minesweeper    # circuit.xbc, schema.json, sources.json
xark setup circuits/minesweeper    # pk.bin, vk.bin (and its sha256)
xark client circuits/minesweeper   # minesweeper.ts and client.wasm
node scripts/gen-artifacts.mjs     # → artifacts/*.ts
```

`scripts/gen-artifacts.mjs` inlines the binaries as base64 modules in `artifacts/`
(`xbc.ts` with `sources.json`, `pk.ts`, `client-wasm.ts`, `vk.ts` with the key's
sha256) and copies the generated client to `artifacts/minesweeper.ts`. It refuses
keys made for another build of the circuit. The worker loads the prover's modules;
the page loads only `vk.ts`.

The prover is pinned to the circuit digest the client was generated from
(`Minesweeper.digest`), and the verifier to the key's sha256 (`keyHash`), so a
rebuilt circuit or key is refused until the artifacts are regenerated together.
`pnpm check:minesweeper` then proves and verifies in Node and checks that a
tampered proof, a tampered reveal, another commitment and a lying house all fail.

## The key

The committed keys are a single-party setup from this machine's randomness
(`xark setup` with no seed): sound unless whoever ran it kept that randomness, which
xark never writes down. That is enough for a demo, and better than a seeded key
(`--deterministic-rng`), whose trapdoor anyone could rederive to forge proofs. A
deployment that needs no one party to be trusted runs `xark ceremony`. Rerunning
`pnpm run setup` makes new keys, so the key's sha256 changes with them.
