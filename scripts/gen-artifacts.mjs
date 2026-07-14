// Regenerate the base64 TS artifact wrappers from the freshly-built xark
// artifacts: artifacts/pk.ts ← target/xark/minesweeper/pk.bin,
// artifacts/xbc.ts ← target/xark/minesweeper/circuit.xbc.
//
// The .bin/.xbc are the source of truth; these .ts wrappers are build artifacts
// (embedded so the workerd prover stays self-contained — no fs, no runtime
// fetch). Run after `xark build` + `xark setup` (see the `setup` npm script).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const circuit = join(root, "circuits", "minesweeper");
const out = join(circuit, "target", "xark", "minesweeper");
const artifacts = join(circuit, "artifacts");

mkdirSync(artifacts, { recursive: true });

function wrap(binPath, constName, fnName) {
  const b64 = readFileSync(binPath).toString("base64");
  return (
    `const ${constName} = "${b64}";\n` +
    `export function ${fnName}(): Uint8Array { return Uint8Array.from(atob(${constName}), c => c.charCodeAt(0)); }\n`
  );
}

writeFileSync(join(artifacts, "pk.ts"), wrap(join(out, "pk.bin"), "PK_BASE64", "pkBytes"));
writeFileSync(join(artifacts, "xbc.ts"), wrap(join(out, "circuit.xbc"), "XBC_BASE64", "xbcBytes"));

// Self-check: decode back and compare to the source bytes.
function check(tsPath, binPath, label) {
  const b64 = readFileSync(tsPath, "utf8").match(/"([^"]+)"/)[1];
  const decoded = Buffer.from(b64, "base64");
  const orig = readFileSync(binPath);
  console.log(
    `${label}: ${decoded.length} bytes —`,
    decoded.equals(orig) ? "roundtrip OK" : "MISMATCH ❌",
  );
}

check(join(artifacts, "pk.ts"), join(out, "pk.bin"), "pk.ts ");
check(join(artifacts, "xbc.ts"), join(out, "circuit.xbc"), "xbc.ts");
