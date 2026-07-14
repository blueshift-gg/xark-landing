/* tslint:disable */
/* eslint-disable */

/**
 * List a circuit's declared inputs (the values [`prove`]'s `inputs_json` must
 * supply) as a JSON string: `[{"name":"…","role":"public"|"private"}, …]` in
 * declaration (variable-id) order. Convenience for the JS caller.
 *
 * `circuit_xbc` is the binary `circuit.xbc`.
 */
export function circuit_inputs(circuit_xbc: Uint8Array): string;

/**
 * Parse a circuit's `circuit.xbc` + `pk.bin` once so subsequent calls to
 * [`prove_fast`] skip all heavy deserialization. Call once per circuit;
 * subsequent calls silently replace the cached state.
 *
 * `circuit_xbc` is the self-contained binary artifact `xark build` always
 * writes; `pk_bytes` is the `pk.bin` from `xark setup`.
 */
export function preload(circuit_xbc: Uint8Array, pk_bytes: Uint8Array): void;

/**
 * Generate a Groth16 proof entirely in memory, self-verified before returning.
 *
 * See the crate docs for the shape of each argument and the return object.
 * Throws a `JsValue` (string) on any error: a malformed `.xbc`, unknown input,
 * an unsatisfiable witness, a malformed proving key, or a proof that fails to
 * self-verify.
 */
export function prove(circuit_xbc: Uint8Array, pk_bytes: Uint8Array, inputs_json: string): any;

/**
 * Like [`prove`], but uses the artifacts cached by a prior [`preload`] call —
 * skipping the `.xbc` expansion and `pk.bin` deserialization on every call.
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

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly circuit_inputs: (a: number, b: number) => [number, number, number, number];
    readonly preload: (a: number, b: number, c: number, d: number) => [number, number];
    readonly prove: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly prove_fast: (a: number, b: number) => [number, number, number];
    readonly verify: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly version: () => [number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
