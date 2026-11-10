"use client";

import { useState } from "react";

import { Chips, Frame } from "./Frame";

const DAY = 86_400_000;
const RANGES = ["Days<1900, 2100>", "Days<1950, 2100>", "Days<2024, 2024>"] as const;
type Range = (typeof RANGES)[number];

/** `Days<FROM, TO>` as `xark::Time` computes it: steps from 1 Jan FROM to 31 Dec TO, UTC. */
function span(r: Range) {
  const [from, to] = r.match(/\d+/g)!.map(Number);
  const start = Date.UTC(from, 0, 1) / DAY;
  const steps = Date.UTC(to + 1, 0, 1) / DAY - start;
  const bits = steps === 1 ? 1 : (steps - 1).toString(2).length;
  return { from, to, start, steps, bits };
}

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * What a `Days<FROM, TO>` is in the circuit: a day count from the start of
 * `FROM`, in just enough bits for the range, and checked on read to be a day
 * in it, since the bits hold more values than the range has days.
 */
export function DaysRange() {
  const [range, setRange] = useState<Range>("Days<1900, 2100>");
  const [date, setDate] = useState("1990-06-15");
  const s = span(range);
  const t = Date.parse(date + "T00:00:00Z");
  const day = Number.isNaN(t) ? null : Math.floor(t / DAY) - s.start;
  const inRange = day !== null && day >= 0 && day < s.steps;
  const codes = 2 ** s.bits;
  const spare = codes - s.steps;

  return (
    <Frame
      label="Days<FROM, TO>"
      hint="pick a range and a date"
      caption={
        <>
          A date is its day count in the circuit, so <code>born &lt;= policy.born_by</code> is a{" "}
          {s.bits}-bit integer comparison.{" "}
          {spare > 0
            ? `The ${fmt(spare)} codes past the last day fit the bits but aren't days: reading the input refuses them.`
            : "The range fills its bits exactly, so reading it needs no extra check."}
        </>
      }
    >
      <div className="xw-row">
        <Chips label="range" options={RANGES} value={range} onChange={setRange} />
        <input
          type="date"
          className="xw-input"
          aria-label="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="xw-days" aria-hidden>
        <span className="xw-days-ok" style={{ width: `${(s.steps / codes) * 100}%` }} />
        <span className="xw-days-spare" style={{ width: `${(spare / codes) * 100}%` }} />
        {inRange && <span className="xw-days-mark" style={{ left: `${(day! / codes) * 100}%` }} />}
      </div>
      <div className="xw-scale">
        <span>0 · 1 Jan {s.from}</span>
        <span>
          {fmt(s.steps - 1)} · 31 Dec {s.to}
        </span>
        <span>{fmt(codes - 1)} · 2^{s.bits} − 1</span>
      </div>

      <dl className="xw-facts">
        <div>
          <dt>days in range</dt>
          <dd>{fmt(s.steps)}</dd>
        </div>
        <div>
          <dt>width</dt>
          <dd>{s.bits} bits</dd>
        </div>
        <div>
          <dt>{date || "date"}</dt>
          <dd className={inRange ? "lime" : "red"}>{inRange ? `day ${fmt(day!)}` : "outside"}</dd>
        </div>
      </dl>

      <div className={"xw-verdict " + (inRange ? "ok" : "no")} role="status">
        {inRange ? (
          <>
            <span className="tag">in range</span> the prover supplies {fmt(day!)}, a {s.bits}-bit
            integer. Tests and <code>--inputs</code> take <code>&quot;{date}&quot;</code>; TypeScript
            takes a <code>Date</code>.
          </>
        ) : (
          <>
            <span className="tag">refused</span> not a day of {range}. The client won&apos;t encode
            it, and no witness satisfies the read check.
          </>
        )}
      </div>
    </Frame>
  );
}
