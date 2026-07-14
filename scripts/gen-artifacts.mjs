// Regenerate the artifact modules from the freshly-built xark artifacts.
// Run after `xark build` + `xark setup` (see the `setup` npm script).
//
//   pk.ts + xbc.ts   server prover (pk.bin + circuit.xbc)
//   vk.ts            browser verifier (vk.bin)
//
// Each exports a `Uint8Array` decoded from a base64 literal via the native
// `Uint8Array.fromBase64` (Node ≥ 25, workerd, modern browsers — the project
// pins Node ≥ 26). base64 is the most compact source encoding (~1.33× the
// binary) and the decode is native, no `atob`/charCodeAt loop. The bytes
// are inlined into the bundle so the workerd prover + browser verifier stay
// self-contained (no fs, no fetch).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const circuit = join(root, "circuits", "minesweeper");
const out = join(circuit, "target", "xark", "minesweeper");
const artifacts = join(circuit, "artifacts");

mkdirSync(artifacts, { recursive: true });

// Emit `export const <name> = Uint8Array.fromBase64("...")` — the export IS the
// bytes, decoded natively at module load.
function emit(binPath, tsPath, name) {
  const b64 = readFileSync(binPath).toString("base64");
  writeFileSync(tsPath, `export const ${name} = Uint8Array.fromBase64("${b64}");\n`);
  return readFileSync(binPath).length;
}

const specs = [
  [join(out, "pk.bin"), join(artifacts, "pk.ts"), "pkBytes"],
  [join(out, "circuit.xbc"), join(artifacts, "xbc.ts"), "xbcBytes"],
  [join(out, "vk.bin"), join(artifacts, "vk.ts"), "vkBytes"],
];

for (const [binPath, tsPath, name] of specs) {
  const n = emit(binPath, tsPath, name);
  console.log(`${name}: ${n} bytes`);
}
