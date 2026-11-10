import type { Metadata } from "next";

export const metadata: Metadata = { title: "Examples" };

const examples = [
  {
    no: "01",
    name: "Over 9000",
    pi: "0 public inputs",
    blurb: "Range proofs. A field has no order, so the circuit proves a secret number beats a bound one bit at a time.",
  },
  {
    no: "02",
    name: "zKYC",
    pi: "5 public inputs",
    blurb: "Range proofs put to work: prove your age and net worth, and a nationality on an allow-list, against a salted commitment.",
  },
  {
    no: "03",
    name: "Token claim",
    pi: "4 public inputs",
    blurb: "Merkle trees in a circuit. Prove your address and amount are on the airdrop list, with the path kept private.",
  },
  {
    no: "04",
    name: "Shielded pool",
    pi: "4 + 7 public inputs",
    blurb: "Merkle trees plus salted commitments. Notes and nullifiers make a withdrawal unlinkable to its deposit.",
  },
  {
    no: "05",
    name: "Anonymous voting",
    pi: "4 public inputs",
    blurb: "Merkle membership plus a nullifier scoped to a poll: one vote per voter per poll, unlinkable across polls, and a range proof keeps the choice among the options.",
  },
  {
    no: "06",
    name: "Shielded transfer",
    pi: "19 public inputs",
    blurb: "Merkle trees and range proofs together. Private payments of any amount; range-checked values keep the sums from wrapping.",
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
          <h1>Six examples, easiest to hardest.</h1>
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
