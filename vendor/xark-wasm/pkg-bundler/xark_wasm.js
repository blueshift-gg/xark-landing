/* @ts-self-types="./xark_wasm.d.ts" */
import * as wasm from "./xark_wasm_bg.wasm";
import { __wbg_set_wasm } from "./xark_wasm_bg.js";

__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    circuit_inputs, preload, prove, prove_fast, verify, version
} from "./xark_wasm_bg.js";
