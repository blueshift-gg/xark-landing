"use client";

import { useState } from "react";

import { Chips, Frame } from "./Frame";

const U64_MAX = (1n << 64n) - 1n;
type Vis = "Private" | "Public";

/** A u64 from what the reader typed, or why it isn't one. */
function parseU64(s: string): bigint | string {
  if (!/^\d+$/.test(s.trim())) return "not a u64";
  const v = BigInt(s.trim());
  return v > U64_MAX ? "past u64::MAX" : v;
}

function fmt(v: bigint): string {
  return v.toLocaleString("en-US");
}

/**
 * Who sees what: the same rule, `power_level > threshold`, with each input
 * switched between `Private` and `Public`. The prover always holds every
 * value; the verifier gets the proof and the public inputs only, and the
 * statement the proof makes changes with the choice.
 */
export function WhoSeesWhat() {
  const [vis, setVis] = useState<Record<"power_level" | "threshold", Vis>>({
    power_level: "Private",
    threshold: "Public",
  });
  const [vals, setVals] = useState({ power_level: "9001", threshold: "9000" });

  const pl = parseU64(vals.power_level);
  const th = parseU64(vals.threshold);
  const valid = typeof pl === "bigint" && typeof th === "bigint";
  const holds = valid && pl > th;

  const names = ["power_level", "threshold"] as const;
  const pub = names.filter((n) => vis[n] === "Public");

  const claim = !holds
    ? null
    : vis.power_level === "Private" && vis.threshold === "Public"
      ? <>someone knows a power level greater than <b>{fmt(th as bigint)}</b>.</>
      : vis.power_level === "Public" && vis.threshold === "Private"
        ? <>someone knows a threshold below <b>{fmt(pl as bigint)}</b>.</>
        : vis.power_level === "Public"
          ? <>{fmt(pl as bigint)} &gt; {fmt(th as bigint)}. Nothing is secret, so a proof adds nothing.</>
          : <>someone knows two numbers, the first greater. That's all: nothing ties them to anything.</>;

  return (
    <Frame
      label="who sees what"
      hint="switch an input, edit a value"
      caption={
        <>
          The prover holds every value. The verifier gets a 256-byte proof and the{" "}
          <code>Public</code> inputs, in the order they're declared, and nothing else.
        </>
      }
    >
      <pre className="xw-code">
        <span className="k">#[circuit]</span>
        {"\n"}
        <span className="k">fn</span> over(
        {names.map((n, i) => (
          <span key={n}>
            {n}: <span className={vis[n] === "Public" ? "pub" : "priv"}>{vis[n]}</span>
            {"<u64>"}
            {i === 0 ? ", " : ""}
          </span>
        ))}
        ) {"{"}
        {"\n    "}
        <span className={valid && !holds ? "bad" : ""}>require(power_level &gt; threshold);</span>
        {"\n}"}
      </pre>

      <div className="xw-split">
        <div className="xw-pane">
          <div className="xw-pane-h">Prover</div>
          {names.map((n) => (
            <div key={n} className="xw-field">
              <label className="xw-name" htmlFor={`wsw-${n}`}>
                {n}
              </label>
              <input
                id={`wsw-${n}`}
                className="xw-input"
                inputMode="numeric"
                value={vals[n]}
                onChange={(e) => setVals((v) => ({ ...v, [n]: e.target.value }))}
                aria-invalid={typeof parseU64(vals[n]) === "string"}
              />
              <Chips
                label={`${n} is`}
                options={["Private", "Public"] as const}
                value={vis[n]}
                onChange={(x) => setVis((v) => ({ ...v, [n]: x }))}
              />
            </div>
          ))}
        </div>

        <div className="xw-arrow" aria-hidden>
          →
        </div>

        <div className="xw-pane">
          <div className="xw-pane-h">Verifier</div>
          {holds ? (
            <div className="xw-proof" title="A Groth16 proof is always 256 bytes, whatever the circuit.">
              <span className="xw-proof-blk" />
              proof · 256 bytes
            </div>
          ) : (
            <div className="xw-proof none">no proof</div>
          )}
          {names.map((n) =>
            vis[n] === "Public" ? (
              <div key={n} className="xw-seen">
                <span className="xw-name">
                  <span className="xw-idx">{pub.indexOf(n)}</span>
                  {n}
                </span>
                <span className="xw-val">
                  {typeof (n === "power_level" ? pl : th) === "bigint"
                    ? fmt((n === "power_level" ? pl : th) as bigint)
                    : "—"}
                </span>
              </div>
            ) : (
              <div key={n} className="xw-seen hidden">
                <span className="xw-name">{n}</span>
                <span className="xw-redact" aria-label="never sent" />
              </div>
            ),
          )}
        </div>
      </div>

      <div className={"xw-verdict" + (holds ? " ok" : valid ? " no" : "")} role="status">
        {!valid ? (
          <>
            {typeof pl === "string" ? `power_level: ${pl}` : `threshold: ${th}`}. A u64 input is
            range-checked to 64 bits, so there's no proof with this value.
          </>
        ) : holds ? (
          <>
            <span className="tag">proves</span> {claim}
          </>
        ) : (
          <>
            <span className="tag">refused</span> the rule fails at line 3, so no proof exists. The
            prover can't make one, however they try.
          </>
        )}
      </div>
    </Frame>
  );
}
