import type { Metadata } from "next";

export const metadata: Metadata = { title: "Examples" };

const examples = [
  {
    no: "01",
    name: "Over 9000",
    pi: "0 public inputs",
    blurb: "Prove a secret number beats a bound. The range-proof primitive.",
  },
  {
    no: "02",
    name: "Age verification",
    pi: "2 public inputs",
    blurb: "Prove 18+ without a birthday. Commitments.",
  },
  {
    no: "03",
    name: "Shielded pool",
    pi: "4 + 7 public inputs",
    blurb: "Unlinkable deposit → withdrawal. Merkle membership + nullifiers.",
  },
  {
    no: "04",
    name: "Shielded transfer",
    pi: "12 public inputs",
    blurb: "Private, arbitrary-amount payments. Zcash-style notes + JoinSplit.",
  },
];

export default function ExamplesPage() {
  return (
    <main className="xk-page">
      <div className="xk-wrap">
        <div className="xk-sec-head">
          <div className="xk-kicker" style={{ marginBottom: 16 }}>
            Examples
          </div>
          <h1>Four circuits, easiest to hardest.</h1>
          <p>
            Each is built, proved, and verified end-to-end in an in-process
            Solana VM.
          </p>
        </div>
        <div className="xk-grid4">
          {examples.map((e) => (
            <a
              key={e.no}
              className="xk-tile"
              href="https://github.com/blueshift-gg/xark-examples"
            >
              <span className="pi">{e.pi}</span>
              <div className="no">{e.no}</div>
              <h3>{e.name}</h3>
              <p>{e.blurb}</p>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
