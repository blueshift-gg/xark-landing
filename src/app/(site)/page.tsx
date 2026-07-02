import { GuessDemo } from "@/components/GuessDemo";

export default function Home() {
  return (
    <main className="xk-main">
      <div className="xk-wrap xk-hero">
        <div className="xk-kicker" style={{ marginBottom: 24 }}>
          Groth16 for Noir · verified on Solana
        </div>
        <h1 className="xk-h1">
          Prove anything.
          <br />
          <span className="xk-rev">Reveal nothing.</span>
        </h1>
        <p className="xk-sub">
          A secret stays secret. The proof is <b>256 bytes</b>. The chain checks
          it in <b>milliseconds</b>.
        </p>

        <GuessDemo />

        <div className="xk-into">
          <a href="/docs">Read the docs →</a>
          <a href="/examples">See the examples →</a>
          <a href="/docs/learn-zk/01-what-is-a-zk-proof">How it works →</a>
        </div>
      </div>
    </main>
  );
}
