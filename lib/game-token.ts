// Stateless game tokens: AES-GCM encrypt the board + salt + commitment into
// the game ID. The client holds an opaque token it can't read (encrypted) or
// modify (authenticated). No server state, no DO, no KV — free.
//
// The secret is validated lazily (on first seal/unseal call, not at import)
// so the module can be bundled during `next build` without the secret present.

let cryptoKey: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (cryptoKey) return cryptoKey;
  const rawSecret = process.env.MINESWEEPER_SECRET;
  if (!rawSecret) {
    const hint = process.env.NODE_ENV === "development"
      ? "Run `pnpm setup` or copy .dev.vars.example → .dev.vars"
      : "Set it via `wrangler secret put MINESWEEPER_SECRET`";
    throw new Error(`MINESWEEPER_SECRET is not set. ${hint}`);
  }
  // Derive a fixed-length AES-256 key from the secret via SHA-256 so any
  // format works — a passphrase, `openssl rand -hex 32`, `openssl rand
  // -base64 32`, etc. Never feed the raw secret string to importKey: it must
  // be exactly 16/24/32 bytes, and a base64/hex string almost never is.
  cryptoKey = crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(rawSecret))
    .then((keyBytes) =>
      crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      ),
    );
  return cryptoKey;
}

export type SealedGame = {
  board: number[];
  salt: string;
  commitment: string;
};

export async function sealGame(game: SealedGame): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(game));
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const out = new Uint8Array(iv.length + buf.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(buf), iv.length);
  return Buffer.from(out).toString("base64url");
}

export async function unsealGame(token: string): Promise<SealedGame | null> {
  try {
    const key = await getKey();
    const raw = new Uint8Array(Buffer.from(token, "base64url"));
    const buf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.slice(0, 12) },
      key,
      raw.slice(12),
    );
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return null;
  }
}
