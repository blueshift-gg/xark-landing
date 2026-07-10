/* tslint:disable */
/* eslint-disable */

/**
 * List a circuit's declared inputs (the values `prove`'s `inputs_json` must
 * supply) as a JSON string: `[{"name":"…","role":"public"|"private"}, …]` in
 * declaration (variable-id) order. Convenience for the JS caller.
 */
export function circuit_inputs(circuit_json: string): string;

/**
 * Parse a circuit's `r1cs.json` + `circuit.json` + `pk.bin` once so
 * subsequent calls to [`prove_fast`] skip all heavy deserialization.
 * Call once per circuit; subsequent calls silently replace the cached state.
 */
export function preload(r1cs_json: string, circuit_json: string, pk_bytes: Uint8Array): void;

/**
 *
 * See the crate docs for the shape of each argument and the return object.
 * Throws a `JsValue` (string) on any error: bad JSON, unknown input, an
 * unsatisfiable witness, a malformed proving key, or a proof that fails to
 * self-verify.
 */
export function prove(r1cs_json: string, circuit_json: string, pk_bytes: Uint8Array, inputs_json: string): any;

/**
 * Like [`prove`], but uses the parsed artifacts cached by a prior [`preload`]
 * call — skipping the ~7 MB JSON + 537 KB pk.bin deserialization on every cell.
 *
 * Returns the same shape as [`prove`]. Throws if [`preload`] hasn't been
 * called for this circuit.
 */
export function prove_fast(inputs_json: string): any;

/**
 * Verify a Groth16 proof against its public inputs, in memory.
 *
 * Mirrors the host `xark verify` (the `public_inputs.bin` path): each argument
 * is the canonical compressed binary written by `xark setup` / `xark prove` —
 * `proof` and `public_inputs` are exactly what [`prove`] returns, and
 * `vk_bytes` is the contents of `vk.bin`.
 *
 * Returns `true` if the proof is valid for `public_inputs` under `vk_bytes`,
 * `false` if it is well-formed but does not verify. Throws a string on a
 * deserialization error (malformed key / proof / public inputs).
 */
export function verify(vk_bytes: Uint8Array, proof_bytes: Uint8Array, public_inputs_bytes: Uint8Array): boolean;

/**
 * xark-wasm package version.
 */
export function version(): string;
