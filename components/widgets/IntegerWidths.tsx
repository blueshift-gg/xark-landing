"use client";

import { useState } from "react";

import { Chips, Frame } from "./Frame";

// BN254's scalar field modulus: every `Field` is a residue modulo this prime.
const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const TYPES = ["u8", "u16", "u32", "u64", "i8", "i32", "Field"] as const;
type Ty = (typeof TYPES)[number];

function parse(s: string): bigint | null {
  const t = s.trim();
  return /^-?\d+$/.test(t) ? BigInt(t) : null;
}

const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;

/** A big number, grouped in threes, broken where it's long. */
function big(v: bigint): string {
  return v.toLocaleString("en-US");
}

/**
 * Integers and `Field`: pick a type, type a value, and see the bits the circuit
 * range-checks it to — or why it doesn't fit — and how a `Field` wraps instead.
 */
export function IntegerWidths() {
  const [ty, setTy] = useState<Ty>("u8");
  const [raw, setRaw] = useState("200");
  const v = parse(raw);

  return (
    <Frame
      label="integer widths"
      hint="pick a type, type a value"
      caption={
        ty === "Field" ? (
          <>
            A <code>Field</code> has no width: it wraps at a 254-bit prime, so <code>&lt;</code> means
            nothing until you give it one (<code>x &lt; 100u32</code>, <code>a.lt::&lt;32&gt;(b)</code>).
          </>
        ) : (
          <>
            An integer input is range-checked to its width as it's read: one constraint per bit.
            That bound is what makes <code>&lt;</code> and <code>&gt;</code> mean what they say.
          </>
        )
      }
    >
      <div className="xw-row">
        <Chips label="type" options={TYPES} value={ty} onChange={setTy} />
        <input
          className="xw-input wide"
          aria-label="value"
          inputMode="numeric"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </div>
      {v === null ? (
        <div className="xw-verdict">Type a whole number, such as 200, 256 or -1.</div>
      ) : ty === "Field" ? (
        <FieldView v={v} />
      ) : (
        <IntView ty={ty} v={v} />
      )}
    </Frame>
  );
}

function IntView({ ty, v }: { ty: Exclude<Ty, "Field">; v: bigint }) {
  const signed = ty.startsWith("i");
  const n = Number(ty.slice(1));
  const lo = signed ? -(1n << BigInt(n - 1)) : 0n;
  const hi = signed ? (1n << BigInt(n - 1)) - 1n : (1n << BigInt(n)) - 1n;
  const fits = v >= lo && v <= hi;

  // What the circuit's bits hold: the value, or for an `iN` its two's complement.
  // A value that doesn't fit shows the bits it would need past the width.
  const word = signed ? mod(v, 1n << BigInt(n)) : v;
  const need = v < 0n && !signed ? n : Math.max(n, word.toString(2).length);
  const extra = fits ? 0 : Math.min(need - n, 8);
  const bits = Array.from({ length: n + extra }, (_, i) => {
    const pos = n + extra - 1 - i; // most significant first
    return { pos, on: v >= 0n || signed ? ((word >> BigInt(pos)) & 1n) === 1n : false, over: pos >= n };
  });

  return (
    <>
      <div className={"xw-bits" + (n > 32 ? " dense" : "")} aria-label={`${n} bits`}>
        {bits.map((b) => (
          <span
            key={b.pos}
            className={"xw-bit" + (b.on ? " on" : "") + (b.over ? " over" : "")}
            title={`bit ${b.pos}`}
          />
        ))}
      </div>
      <div className="xw-scale">
        <span>bit {n + extra - 1}</span>
        <span>{n} bits checked</span>
        <span>bit 0</span>
      </div>
      <div className={"xw-verdict " + (fits ? "ok" : "no")} role="status">
        {fits ? (
          <>
            <span className="tag">fits</span> {big(v)} is {signed ? "an" : "a"} {ty}
            {signed && v < 0n ? <>, held as its two&apos;s complement {big(word)}</> : null}. Its range
            check is {n} constraints.
          </>
        ) : (
          <>
            <span className="tag">refused</span> {signed ? "an" : "a"} {ty} holds {big(lo)} to {big(hi)}.{" "}
            {v < 0n && !signed
              ? "An unsigned type has no negative values."
              : `${big(v)} needs ${need} bits.`}{" "}
            The client refuses it, and the circuit&apos;s range check has no witness for it.
          </>
        )}
      </div>
    </>
  );
}

function FieldView({ v }: { v: bigint }) {
  const e = mod(v, P);
  const len = e === 0n ? 0 : e.toString(2).length;
  const wrapped = e !== v;
  return (
    <>
      <div className="xw-fieldbar" aria-label={`${len} of 254 bits`}>
        <span style={{ width: `${(len / 254) * 100}%` }} />
      </div>
      <div className="xw-scale">
        <span>0</span>
        <span>{len} of 254 bits</span>
        <span>p − 1</span>
      </div>
      <div className="xw-big">{big(e)}</div>
      <div className={"xw-verdict" + (wrapped ? " no" : " ok")} role="status">
        {wrapped ? (
          <>
            <span className="tag">wraps</span>
            {v < 0n
              ? ` in the field, ${big(v)} is p − ${big(-v)}: one of the largest elements, not a small negative. That's what 0 − ${big(-v)} computes in a circuit.`
              : ` ${big(v)} is past p, so it's ${big(e)}. The client refuses it rather than reduce it, since it would prove a different number.`}
          </>
        ) : (
          <>
            <span className="tag">a field element</span> no range check, so it&apos;s free. Try{" "}
            <code>-1</code>.
          </>
        )}
      </div>
    </>
  );
}
