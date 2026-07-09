// Minimal ambient typing for `snarkjs` (it ships no .d.ts). The landing only
// uses `groth16.verify` in the browser; typed loosely to match the `as any`
// call sites in MinesweeperDemo.tsx.
declare module "snarkjs" {
  export const groth16: {
    verify: (
      vkey: unknown,
      publicSignals: unknown,
      proof: unknown,
    ) => Promise<boolean>;
  };
}
