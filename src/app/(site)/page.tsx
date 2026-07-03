import { GuessDemo } from "@/components/GuessDemo";
import HeadingReveal from "@/components/HeadingReveal";

export default function Home() {
  return (
    <main className="xk-main">
      <div className="xk-wrap xk-hero">
        <HeadingReveal
          headingLevel="h1"
          className="xk-h1"
          lines={[
            { text: "Prove anything." },
            { text: "Reveal nothing.", className: "xk-rev", color: "#565656" },
          ]}
          splitBy="words"
          cursorColor="#99ff00"
          color="#ffffff"
        />
        <p className="xk-sub">
          A secret stays secret. The proof is <b>256 bytes</b>. The chain checks
          it in <b>milliseconds</b>.
        </p>

        <GuessDemo />

        {/* <div className="xk-into">
          <a href="/docs">Read the docs →</a>
          <a href="/examples">See the examples →</a>
          <a href="/docs/learn-zk/01-what-is-a-zk-proof">How it works →</a>
        </div> */}
      </div>
    </main>
  );
}
