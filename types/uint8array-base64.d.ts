// Ambient typings for the TC39 Uint8Array base64/hex helpers
// (https://github.com/tc39/proposal-arraybuffer-base64). Shipped in Node ≥ 25,
// workerd, and modern browsers — the project pins Node ≥ 26 — but the bundled
// TypeScript lib / @types/node don't declare them yet. Remove once they do.
type Base64Alphabet = "base64" | "base64url";

interface Uint8ArrayConstructor {
  fromBase64(
    base64: string,
    options?: { alphabet?: Base64Alphabet; lastChunkHandling?: "loose" | "strict" | "stop-before-partial" },
  ): Uint8Array;
  fromHex(hex: string): Uint8Array;
}

interface Uint8Array {
  toBase64(options?: { alphabet?: Base64Alphabet; omitPadding?: boolean }): string;
  toHex(): string;
}
