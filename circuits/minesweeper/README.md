# minesweeper circuit

The Noir circuit behind the landing's ZK-minesweeper demo. The 9×9 board (0 = safe,
1 = mine) packs into one field element and is committed as `Poseidon2(packed, salt)`.
Given a public cell `(r, c)` the circuit returns `(commitment, is_mine, count)` —
proving that one cell's value against the committed board while revealing nothing
about any other cell. 5 public inputs, ~724 R1CS constraints, all opcodes
xark-supported.

## How the demo uses it

- The board + salt live server-side (`lib/minesweeper.ts`); the `/api/minesweeper/*`
  routes shell out to `nargo execute` + `xark prove` (~0.3s per cell).
- The browser verifies each proof with snarkjs against the committed
  `verification_key.json` before revealing the cell.

Every reveal proves against the same commitment, so the house can't move a mine or
lie about a cell, and unopened cells stay hidden.

## Setup (once)

Regenerate the keys that match the committed `verification_key.json`, deterministically:

```sh
nargo execute
xark setup --insecure-dev-mode --deterministic-rng 42
```

These are dev keys — forgeable, never for production; a real deployment runs
`xark ceremony`. The prover needs `nargo` and `xark` on PATH and a **Node runtime**
(not a Cloudflare Worker).

## Test

```sh
nargo test
```
