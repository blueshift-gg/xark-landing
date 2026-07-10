# xark-landing

Landing, docs, and the interactive demo for [xark](https://github.com/blueshift-gg/xark)
— a Groth16 proving backend for Noir, verified on Solana.

Built to match the Doppler house stack: **Next.js (App Router) + Fumadocs + Tailwind v4**,
dark, with the xark lime-on-black identity.

## Run it

```bash
pnpm install
pnpm setup       # builds the circuit + Groth16 keys + copies env templates
pnpm dev          # http://localhost:3000
```

(Requires Node 20+, pnpm, and the `xark` CLI on PATH.)

## Production secrets

The minesweeper demo encrypts game state into a token using `MINESWEEPER_SECRET`.
The key is derived from the secret with SHA-256, so any strong random string
works — hex, base64, or a long passphrase all produce a valid AES-256 key.
For local dev, `pnpm setup` copies the default from `.dev.vars.example`. For
production:

```bash
# Generate a strong secret and set it on the deployed Worker:
openssl rand -base64 32 | npx wrangler secret put MINESWEEPER_SECRET
```

Wrangler encrypts it and injects it as `process.env.MINESWEEPER_SECRET` at runtime.

## Structure

```
src/app/
  (site)/            marketing surfaces (own Header/Footer, scoped landing.css)
    page.tsx         landing — hero + the "guess the secret" demo
    examples/        the four reference circuits
  docs/              Fumadocs docs shell + [[...slug]] renderer
  layout.tsx         root — fonts, dark theme, metadata
  globals.css        Tailwind + Fumadocs theme tokens (black + lime)
content/docs/        the docs, as MDX (Learn-ZK track + quickstart)
components/          Wordmark, Header, Footer, GuessDemo (client), mdx
lib/source.ts        Fumadocs content loader
source.config.ts     Fumadocs collection config
```

## The demo

The landing hero is **guess-the-secret**: pick a number, "prove" it, and a lime side
panel reveals what happened — your guess, the commitment (fixed beforehand), the verified
proof, and the winning number that stays hidden.

v1 is a client-side visual demo. The honest version proves server-side with the real
`xark` CLI (the secret + salt never reach the browser) and verifies the proof in-browser
via snarkjs-wasm — wired behind the same UI. That's the next spike.

## Design

Brand: pixelated lime **X** + white "ark" on black. Palette: `#99FF00` electric lime
(single accent), white, black. Type: Space Grotesk (headings) + IBM Plex Mono
(labels/numbers). Motif: the pixel grid. Restraint reference: Doppler.
