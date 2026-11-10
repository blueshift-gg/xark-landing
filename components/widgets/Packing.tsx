"use client";

import { useState } from "react";

import { Chips, Frame } from "./Frame";

// xark's `PACK_BITS`: every value below 2^253 is a distinct BN254 scalar, so a
// packed element splits back one way only.
const PACK_BITS = 253;

/** A struct field: its type, and its width when packed (`null`: never packed). */
type F = { name: string; ty: string; bits: number | null };

// The two structs from the Inputs reference. Widths are `Type::bits`: a
// `Days<1900, 2100>` is 17 bits, a `Choice<Country>` 8 (249 variants), a
// `Bitfield<Country>` 249 (one per variant); a `Field` and a `Text` stand alone.
const STRUCTS: Record<"Identity" | "Policy", F[]> = {
  Identity: [
    { name: "document", ty: "Text", bits: null },
    { name: "born", ty: "Days<1900, 2100>", bits: 17 },
    { name: "nationality", ty: "Choice<Country>", bits: 8 },
    { name: "net_worth", ty: "u64", bits: 64 },
    { name: "expires", ty: "Days<1900, 2100>", bits: 17 },
    { name: "salt", ty: "Field", bits: null },
  ],
  Policy: [
    { name: "today", ty: "Days<1900, 2100>", bits: 17 },
    { name: "born_by", ty: "Days<1900, 2100>", bits: 17 },
    { name: "min_net_worth", ty: "u64", bits: 64 },
    { name: "allowed", ty: "Bitfield<Country>", bits: 249 },
  ],
};

type Elem = { fields: { f: F; bits: number }[]; packed: boolean };

/** `xark::input::pack_of`, for every field at once: the struct's field elements. */
function pack(fs: F[], unpacked: Set<string>): Elem[] {
  const out: Elem[] = [];
  let run: Elem | null = null;
  let total = 0;
  for (const f of fs) {
    const w = unpacked.has(f.name) ? null : f.bits;
    if (w === null) {
      // Its own element: a `Field` fills it, a `Text` takes 31 bytes, an
      // unpacked integer only its width, with the rest of the element unused.
      out.push({ fields: [{ f, bits: f.bits ?? (f.ty === "Text" ? 248 : 254) }], packed: false });
      run = null;
      continue;
    }
    if (run && total + w <= PACK_BITS) {
      run.fields.push({ f, bits: w });
      total += w;
    } else {
      run = { fields: [{ f, bits: w }], packed: true };
      out.push(run);
      total = w;
    }
  }
  return out;
}

/**
 * How an `#[input]` struct becomes field elements: narrow fields share one, in
 * declaration order, up to 253 bits; a `Field`, a `Text` or an `#[unpacked]`
 * field has its own. Click a narrow field to unpack it.
 */
export function Packing() {
  const [which, setWhich] = useState<"Identity" | "Policy">("Identity");
  const [unpacked, setUnpacked] = useState<Set<string>>(new Set());
  const [hot, setHot] = useState<string | null>(null);
  const fs = STRUCTS[which];
  const elems = pack(fs, unpacked);

  const toggle = (f: F) => {
    if (f.bits === null) return;
    setUnpacked((u) => {
      const n = new Set(u);
      if (n.has(f.name)) n.delete(f.name);
      else n.add(f.name);
      return n;
    });
  };

  return (
    <Frame
      label="#[input] packing"
      hint="click a field to unpack it"
      caption={
        <>
          Each field element is one public input, or one value to hash. Keep narrow fields next to
          each other: a <code>Field</code> or <code>#[unpacked]</code> field between them splits the
          run.
        </>
      }
    >
      <div className="xw-row">
        <Chips
          label="struct"
          options={["Identity", "Policy"] as const}
          value={which}
          onChange={(w) => {
            setWhich(w);
            setUnpacked(new Set());
          }}
        />
        <span className="xw-count">
          <b>{elems.length}</b> field element{elems.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="xw-pack">
        <pre className="xw-code">
          <span className="k">#[input]</span>
          {"\n"}
          <span className="k">struct</span> {which} {"{"}
          {fs.map((f) => (
            <span key={f.name}>
              {"\n    "}
              <button
                type="button"
                className={
                  "xw-line" +
                  (hot === f.name ? " hot" : "") +
                  (f.bits === null ? " own" : "") +
                  (unpacked.has(f.name) ? " un" : "")
                }
                onMouseEnter={() => setHot(f.name)}
                onMouseLeave={() => setHot(null)}
                onFocus={() => setHot(f.name)}
                onBlur={() => setHot(null)}
                onClick={() => toggle(f)}
                aria-pressed={f.bits === null ? undefined : unpacked.has(f.name)}
                title={f.bits === null ? "always its own element" : "click to toggle #[unpacked]"}
              >
                {unpacked.has(f.name) && <span className="k">#[unpacked] </span>}
                {f.name}: <span className="t">{f.ty}</span>,
                <span className="w">{f.bits === null ? "own" : `${f.bits} bits`}</span>
              </button>
            </span>
          ))}
          {"\n}"}
        </pre>

        <div className="xw-elems">
          {elems.map((e, i) => {
            const used = e.fields.reduce((n, x) => n + x.bits, 0);
            return (
              <div key={i} className="xw-elem">
                <div className="xw-elem-h">
                  <span>element {i}</span>
                  <span>
                    {e.packed
                      ? `${used} / ${PACK_BITS} bits`
                      : e.fields[0].f.ty === "Text"
                        ? "31 bytes"
                        : e.fields[0].f.bits !== null
                          ? `${used} bits, unpacked`
                          : "254 bits"}
                  </span>
                </div>
                <div className="xw-track">
                  {e.fields.map(({ f, bits }) => (
                    <span
                      key={f.name}
                      className={"xw-seg" + (e.packed ? " packed" : "") + (hot === f.name ? " hot" : "")}
                      style={{ width: `${(bits / 254) * 100}%` }}
                      onMouseEnter={() => setHot(f.name)}
                      onMouseLeave={() => setHot(null)}
                      title={`${f.name}: ${f.ty}`}
                    >
                      {bits >= 40 && <span>{f.name}</span>}
                    </span>
                  ))}
                </div>
                {e.packed && (
                  <div className="xw-legend">
                    {e.fields.map(({ f, bits }) => (
                      <span
                        key={f.name}
                        className={hot === f.name ? "hot" : ""}
                        onMouseEnter={() => setHot(f.name)}
                        onMouseLeave={() => setHot(null)}
                      >
                        {f.name} <i>{bits}</i>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Frame>
  );
}
