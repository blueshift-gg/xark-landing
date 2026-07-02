"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const COLS = 24;
const ROWS = 4;
const TOTAL = COLS * ROWS;

export function GuessDemo() {
  const [guess, setGuess] = useState("402917");
  const [lit, setLit] = useState(0);
  const [proving, setProving] = useState(false);
  const [open, setOpen] = useState(false);
  const [shownGuess, setShownGuess] = useState("402917");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => clear, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const prove = useCallback(() => {
    if (proving) return;
    clear();
    setOpen(false);
    setLit(0);
    setShownGuess(guess || "—");
    setProving(true);
    let i = 0;
    // NOTE: v1 visual demo. The real flow proves server-side with the xark CLI
    // (secret + salt never reach the browser) and verifies here via snarkjs-wasm.
    timer.current = setInterval(() => {
      i = Math.min(i + 8, TOTAL);
      setLit(i);
      if (i >= TOTAL) {
        clear();
        setProving(false);
        setTimeout(() => setOpen(true), 140);
      }
    }, 45);
  }, [guess, proving]);

  return (
    <>
      <div className="xk-demo">
        <div className="xk-demo-head">
          <span>guess-the-secret.nr</span>
          <span className="xk-lock">
            <span className="xk-dot" /> WINNER COMMITTED
          </span>
        </div>
        <div className="xk-demo-body">
          <div className="xk-commit-row">
            <span className="lbl">Commitment</span>
            <span className="val">0x99f0a7c4…e21c</span>
          </div>
          <div className="xk-prompt">Guess the secret number.</div>
          <div className="xk-inrow">
            <input
              value={guess}
              onChange={(e) => setGuess(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") prove();
              }}
              inputMode="numeric"
              placeholder="e.g. 402917"
              aria-label="your guess"
            />
            <button className="xk-btn" onClick={prove} disabled={proving}>
              Prove
            </button>
          </div>
          <div className="xk-proofgrid">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <div key={i} className={i < lit ? "xk-px on" : "xk-px"} />
            ))}
          </div>
          <div className="xk-status">
            {proving ? (
              "proving…"
            ) : lit >= TOTAL ? (
              <>
                <span className="xk-lime">Not it.</span> Verified — the number is
                still secret.
              </>
            ) : (
              "The winner was fixed before you arrived. Prove a guess."
            )}
          </div>
        </div>
      </div>

      <div
        className={open ? "xk-scrim open" : "xk-scrim"}
        onClick={() => setOpen(false)}
      />
      <aside className={open ? "xk-panel open" : "xk-panel"} aria-hidden={!open}>
        <div className="xk-ph">
          <span className="t">WHAT JUST HAPPENED</span>
          <button
            className="xk-x"
            aria-label="close"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
        <div className="xk-result">Not it.</div>
        <div className="xk-prow">
          <span className="k">your guess</span>
          <span className="v">{shownGuess}</span>
        </div>
        <div className="xk-prow">
          <span className="k">commitment · fixed beforehand</span>
          <span className="v">0x99f0…e21c</span>
        </div>
        <div className="xk-prow">
          <span className="k">groth16 proof · 256 bytes</span>
          <span className="v">verified ✓</span>
        </div>
        <div className="xk-prow">
          <span className="k">winning number</span>
          <span className="v">
            <span className="xk-scell" />
            never revealed
          </span>
        </div>
        <div className="xk-pcap">
          You played a game you can <b>verify is fair</b>, against a number you{" "}
          <b>can{"'"}t see</b> and <b>can{"'"}t find</b>. That{"'"}s a
          zero-knowledge proof.
        </div>
        <a className="xk-pverify" href="/docs/learn-zk/01-what-is-a-zk-proof">
          verify this proof yourself →
        </a>
      </aside>
    </>
  );
}
