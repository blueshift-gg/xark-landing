# xark-landing

Landing, docs, and the interactive demo for [xark](https://github.com/blueshift-gg/xark)
— full stack zero knowledge programming for Rust, verified on Solana.

Built to match the Doppler house stack: **Next.js (App Router) + Fumadocs + Tailwind v4**,
dark, with the xark lime-on-black identity.

## Run it

```bash
pnpm install
pnpm dev                    # http://localhost:3000
```

Requires Node 26 or newer and pnpm. The demo's circuit, keys and typed client are
committed (`circuits/minesweeper/artifacts/`), so nothing else is needed to run it.
After changing the circuit, rebuild them with the xark 0.3 CLI
(`cargo install xark-cli --version 0.3.0 --locked`; any stable Rust ≥ 1.89 with the
`wasm32-unknown-unknown` target):

```bash
pnpm run setup              # xark build + setup + client, then the artifact modules
pnpm check:minesweeper      # prove and verify in Node; tampering must be refused
```

(`pnpm run setup`, not `pnpm setup`: that is pnpm's own command.)

`pnpm dev` and `pnpm build` both bundle with webpack: under Turbopack the prover's
Web Worker can't fetch xark's wasm.

## Structure

```
src/app/
  (site)/            marketing surfaces (own Header/Footer, scoped landing.css)
    page.tsx         landing — hero + the minesweeper demo
    examples/        the four reference circuits
  docs/              Fumadocs docs shell + [[...slug]] renderer
  layout.tsx         root — fonts, dark theme, metadata
  globals.css        Tailwind + Fumadocs theme tokens (black + lime)
content/docs/        the docs, as MDX (Learn-ZK track + quickstart)
components/          Wordmark, Header, Footer, MinesweeperDemo (client), mdx
circuits/minesweeper the demo's circuit crate, and its built artifacts
lib/                 Fumadocs loader, the demo's worker and shared types
scripts/             the artifact generator and the demo's end-to-end check
```

## The demo

The landing hero is **zero-knowledge minesweeper**: a house commits to a 9×9 board,
and every cell you open comes with a Groth16 proof that what it shows is the
committed board's, so the house can't move a mine or lie about a count, and the
cells you haven't opened stay hidden.

It runs entirely in the browser on [`@blueshift-gg/xark`](https://www.npmjs.com/package/@blueshift-gg/xark)
0.3. The house is a Web Worker (`lib/minesweeper.worker.ts`) that holds the board and
proves each reveal with the client `xark client` generated, pinned to the circuit's
digest; the page never sees the board. The page verifies each proof itself, with a
verifier pinned to the verifying key's sha256, against the commitment it was given at
the start and the cells it is about to draw. A reveal proves in about 60 ms on one
thread. `circuits/minesweeper/README.md` has the circuit and how the artifacts are made.

## Design

Brand: pixelated lime **X** + white "ark" on black. Palette: `#99FF00` electric lime
(single accent), white, black. Type: Space Grotesk (headings) + IBM Plex Mono
(labels/numbers). Motif: the pixel grid. Restraint reference: Doppler.
