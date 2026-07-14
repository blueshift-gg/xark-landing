/* @ts-self-types="./xark_wasm.d.ts" */
import * as wasm from "./xark_wasm_bg.wasm";
import { __wbg_set_wasm } from "./xark_wasm_bg.js";

__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    circuit_inputs, preload, proof_to_snarkjs_json, prove, prove_preloaded, public_inputs_to_snarkjs_json, verify, version
} from "./xark_wasm_bg.js";
