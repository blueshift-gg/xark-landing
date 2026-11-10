"use client";

import { useState } from "react";

import { Chips, Frame } from "./Frame";

// BN254's scalar field modulus.
const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const mod = (a: bigint) => ((a % P) + P) % P;

const WIDTHS = ["4 bits", "8 bits"] as const;
type Mode = "range-checked" | "unchecked";

function parse(s: string): bigint | null {
  const t = s.trim();
  return /^-?\d+$/.test(t) ? BigInt(t) : null;
}

/** `v` as `n` bits, most significant first. */
function bitsOf(v: bigint, n: number): boolean[] {
  return Array.from({ length: n }, (_, i) => ((v >> BigInt(n - 1 - i)) & 1n) === 1n);
}

function Bits({ v, n, label, top, lead }: { v: bigint; n: number; label: string; top?: boolean; lead?: boolean }) {
  return (
    <div className="xw-cmp-row">
      <span className="xw-cmp-l">{label}</span>
      <span className="xw-cmp-bits">
        {lead && <span className="xw-cmp-bit pad" aria-hidden />}
        {bitsOf(v, n).map((b, i) => (
          <span
            key={i}
            className={"xw-cmp-bit" + (b ? " on" : "") + (top && i === 0 ? " top" : "")}
          >
            {b ? 1 : 0}
          </span>
        ))}
      </span>
      <span className="xw-cmp-v">{v.toString()}</span>
    </div>
  );
}

/**
 * How a circuit proves `a < b`: both are range-checked to `N` bits, then
 * `a − b + 2^N` is split into `N + 1` bits and its top bit read. Switch the
 * range checks off and a "negative" `b` (a huge residue) fools the comparison.
 */
export function Comparison() {
  const [w, setW] = useState<(typeof WIDTHS)[number]>("8 bits");
  const [mode, setMode] = useState<Mode>("range-checked");
  const [ra, setA] = useState("5");
  const [rb, setB] = useState("200");
  const n = w === "4 bits" ? 4 : 8;
  const lim = 1n << BigInt(n);
  const a = parse(ra);
  const b = parse(rb);

  let body;
  if (a === null || b === null) {
    body = <div className="xw-verdict">Type two whole numbers.</div>;
  } else {
    const fa = mod(a);
    const fb = mod(b);
    const fits = fa < lim && fb < lim;
    // The circuit's arithmetic: everything mod p.
    const d = mod(fa - fb + lim);
    const dFits = d < lim << 1n;
    const geq = dFits && (d >> BigInt(n)) === 1n; // the top bit: 1 iff a ≥ b
    const truth = fa >= fb; // as integers, the residues' true order
    body =
      mode === "range-checked" && !fits ? (
        <div className="xw-verdict no" role="status">
          <span className="tag">no proof</span>
          {fa >= lim ? "a" : "b"} = {(fa >= lim ? fa : fb).toString().slice(0, 24)}
          {(fa >= lim ? fa : fb) > 10n ** 24n ? "…" : ""} doesn&apos;t fit in {n} bits, so its range check has
          no witness. The comparison never runs on it.
        </div>
      ) : (
        <>
          {fits && (
            <>
              <Bits v={fa} n={n} label="a" lead />
              <Bits v={fb} n={n} label="b" lead />
            </>
          )}
          {dFits ? (
            <Bits v={d} n={n + 1} label={`a − b + 2^${n}`} top />
          ) : (
            <div className="xw-big">a − b + 2^{n} = {d.toString()} (mod p): not {n + 1} bits</div>
          )}
          <div className={"xw-verdict " + (dFits && geq === truth ? "ok" : "no")} role="status">
            {!dFits ? (
              <>
                <span className="tag">no proof</span> the difference doesn&apos;t fit in {n + 1} bits
                either way.
              </>
            ) : geq === truth ? (
              <>
                <span className="tag">{geq ? "a ≥ b" : "a < b"}</span> the top bit is {geq ? 1 : 0}.
                With both under 2^{n}, the difference lies in (0, 2^{n + 1}) and can&apos;t wrap, so
                the bit is the answer.
              </>
            ) : (
              <>
                <span className="tag">lies</span> the top bit says {geq ? "a ≥ b" : "a < b"}, but{" "}
                {fa >= lim ? "a" : "b"} isn&apos;t a small number: it&apos;s the residue{" "}
                {(fa >= lim ? fa : fb).toString().slice(0, 12)}…
                {(fa >= lim ? a : b)! < 0n
                  ? ` (in the field, ${(fa >= lim ? a : b)!.toString()} is p − ${(-(fa >= lim ? a : b)!).toString()})`
                  : ""}
                . Unchecked, it passes a comparison it should fail. That&apos;s why every ordered value
                is range-checked first.
              </>
            )}
          </div>
        </>
      );
  }

  return (
    <Frame
      label="how a < b is proved"
      hint="try b = -1 with checks off"
      caption={
        <>
          A field has no order, so a circuit compares integers it has first proved small: each is
          split into bits, each bit constrained to 0 or 1. That split is the range proof.
        </>
      }
    >
      <div className="xw-row">
        <Chips label="width" options={WIDTHS} value={w} onChange={setW} />
        <Chips
          label="range checks"
          options={["range-checked", "unchecked"] as const}
          value={mode}
          onChange={setMode}
        />
      </div>
      <div className="xw-row">
        <label className="xw-name" htmlFor="cmp-a">
          a
        </label>
        <input id="cmp-a" className="xw-input" inputMode="numeric" value={ra} onChange={(e) => setA(e.target.value)} />
        <label className="xw-name" htmlFor="cmp-b">
          b
        </label>
        <input id="cmp-b" className="xw-input" inputMode="numeric" value={rb} onChange={(e) => setB(e.target.value)} />
      </div>
      {body}
    </Frame>
  );
}
