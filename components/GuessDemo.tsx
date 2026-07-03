"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { smooth } from "@/utils/easings";
import { setDefaultFavicon, setProofFavicon } from "@/utils/favicon";

const COLS = 24;
const ROWS = 6;
const TOTAL = COLS * ROWS;
const BLINK_INTERVAL_MS = 5000;
const CELL_STAGGER = 0.005;
const CELL_DURATION = 0.35;
const CELL_WAVE_MS = (TOTAL - 1) * CELL_STAGGER * 1000 + CELL_DURATION * 1000;
const CARD_STYLE_TRANSITION = { duration: 0.4, ease: smooth };
const CELL_TRANSITION = { ease: smooth, duration: CELL_DURATION };
const SHAKE_DURATION = 0.45;
const SHAKE_DURATION_MS = SHAKE_DURATION * 1000;
const SHAKE_KEYFRAMES = [0, -10, 10, -7, 7, -4, 4, 0];
const CELL_OFF = "#141414";
const CELL_ON = "#99ff00";

const bodyVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25, ease: smooth } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

export function GuessDemo() {
  const [guess, setGuess] = useState("402917");
  const [lit, setLit] = useState(0);
  const [proving, setProving] = useState(false);
  const [hasProved, setHasProved] = useState(false);
  const [blinking, setBlinking] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [shownGuess, setShownGuess] = useState("402917");
  const [resetting, setResetting] = useState(false);
  const [shaking, setShaking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkCooldown = useRef(false);
  const blinkInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const blinkStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearProveTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const clearResetTimer = () => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  };

  const clearBlinkTimer = () => {
    if (blinkTimer.current) {
      clearTimeout(blinkTimer.current);
      blinkTimer.current = null;
    }
  };

  const clearBlinkSchedule = () => {
    if (blinkStartTimer.current) {
      clearTimeout(blinkStartTimer.current);
      blinkStartTimer.current = null;
    }
    if (blinkInterval.current) {
      clearInterval(blinkInterval.current);
      blinkInterval.current = null;
    }
    clearBlinkTimer();
  };

  useEffect(
    () => () => {
      clearProveTimer();
      clearResetTimer();
      clearBlinkSchedule();
    },
    [],
  );

  useEffect(() => {
    if (hasProved) setProofFavicon();
    else setDefaultFavicon();
  }, [hasProved]);

  useEffect(() => () => setDefaultFavicon(), []);

  useEffect(() => {
    if (hasProved || resetting) return;

    const runBlink = () => {
      setBlinking(true);
      clearBlinkTimer();
      blinkTimer.current = setTimeout(
        () => setBlinking(false),
        CELL_WAVE_MS,
      );
    };

    const initialDelay = blinkCooldown.current ? BLINK_INTERVAL_MS : 0;
    blinkCooldown.current = false;

    blinkStartTimer.current = setTimeout(() => {
      runBlink();
      blinkInterval.current = setInterval(runBlink, BLINK_INTERVAL_MS);
    }, initialDelay);

    return () => clearBlinkSchedule();
  }, [hasProved, resetting]);

  const reset = useCallback(() => {
    clearProveTimer();
    clearResetTimer();
    clearBlinkSchedule();
    setBlinking(false);
    setProving(false);
    setShaking(false);
    setShowResult(false);
    setHasProved(true);
    setLit(TOTAL);
    setResetting(true);
    requestAnimationFrame(() => {
      setLit(0);
    });
    resetTimer.current = setTimeout(() => {
      setHasProved(false);
      setResetting(false);
      blinkCooldown.current = true;
    }, CELL_WAVE_MS);
  }, []);

  const prove = useCallback(() => {
    if (proving || resetting || shaking) return;
    setHasProved(true);
    setBlinking(false);
    clearBlinkSchedule();
    clearProveTimer();
    setShowResult(false);
    setLit(0);
    setShownGuess(guess || "—");
    setProving(true);
    // NOTE: v1 visual demo. The real flow proves server-side with the xark CLI
    // (secret + salt never reach the browser) and verifies here via snarkjs-wasm.
    requestAnimationFrame(() => {
      setLit(TOTAL);
    });
    timer.current = setTimeout(() => {
      setProving(false);
      setShowResult(true);
      timer.current = setTimeout(() => {
        setShaking(true);
        timer.current = setTimeout(() => {
          setShaking(false);
        }, SHAKE_DURATION_MS);
      }, 0);
    }, CELL_WAVE_MS);
  }, [guess, proving, resetting, shaking]);

  const isLime = showResult;

  return (
    <motion.div
      className={isLime ? "xk-demo is-result" : "xk-demo"}
      animate={{
        x: shaking ? SHAKE_KEYFRAMES : 0,
        backgroundColor: isLime ? "#99ff00" : "#0b0b0b",
        borderColor: isLime ? "#99ff00" : "#1c1c1c",
        color: isLime ? "#0a0a0a" : "#ffffff",
      }}
      transition={{
        x: { duration: SHAKE_DURATION, ease: smooth },
        backgroundColor: {
          duration: showResult ? CARD_STYLE_TRANSITION.duration : 0,
          ease: smooth,
        },
        borderColor: {
          duration: showResult ? CARD_STYLE_TRANSITION.duration : 0,
          ease: smooth,
        },
        color: {
          duration: showResult ? CARD_STYLE_TRANSITION.duration : 0,
          ease: smooth,
        },
      }}
    >
      <div className="xk-demo-head">
        <span>guess-the-secret.nr</span>
        <span className="xk-lock">
          <span className="xk-dot" /> WINNER COMMITTED
        </span>
      </div>
      <AnimatePresence>
        {showResult ? (
          <motion.div
            key="result"
            className="xk-demo-body"
            variants={bodyVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="xk-result">Not it.</div>
            <div className="xk-prow">
              <span className="k">your guess</span>
              <span className="v">{shownGuess}</span>
            </div>
            <div className="xk-prow">
              <span className="k">commitment</span>
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
              You played a game you can <b>verify is fair</b>, against a number
              you <b>can{"'"}t see</b> and <b>can{"'"}t find</b>. That{"'"}s a
              zero-knowledge proof.
            </div>
            <div className="xk-result-actions">
              <a
                className="xk-btn-outline"
                href="/docs/learn-zk/01-what-is-a-zk-proof"
              >
                Verify yourself
              </a>
              <button type="button" className="xk-btn-dark" onClick={reset}>
                Make another guess
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="prove"
            className="xk-demo-body xk-demo-body--compact-bottom"
            variants={bodyVariants}
            initial={false}
            animate="animate"
            exit="exit"
          >
            <div className="xk-commit-row">
              <span className="lbl">Commitment</span>
              <span className="val">0x99f0a7c4…e21c</span>
            </div>
            <div className="xk-prompt">Guess the secret number.</div>
            <div className="xk-inrow">
              <input
                value={guess}
                onChange={(e) =>
                  setGuess(e.target.value.replace(/[^0-9]/g, ""))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") prove();
                }}
                inputMode="numeric"
                placeholder="e.g. 402917"
                aria-label="your guess"
                disabled={proving || resetting || shaking}
              />
              <button
                className="xk-btn"
                onClick={prove}
                disabled={proving || resetting || shaking}
              >
                Prove
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div
        className={
          showResult ? "xk-grid-wrap is-collapsed" : "xk-grid-wrap"
        }
        aria-hidden={showResult}
      >
        <div className="xk-proofgrid">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <motion.div
              key={i}
              className="xk-px"
              animate={{
                backgroundColor: hasProved && i < lit ? CELL_ON : CELL_OFF,
              }}
              transition={{
                ...CELL_TRANSITION,
                delay: resetting
                  ? (TOTAL - 1 - i) * CELL_STAGGER
                  : proving
                    ? i * CELL_STAGGER
                    : 0,
              }}
            >
              <motion.span
                className="xk-px-blink"
                initial={{ opacity: 0 }}
                animate={
                  !hasProved && blinking
                    ? { opacity: [0, 1, 0] }
                    : { opacity: 0 }
                }
                transition={{
                  ...CELL_TRANSITION,
                  delay: !hasProved && blinking ? i * CELL_STAGGER : 0,
                }}
                aria-hidden
              />
            </motion.div>
          ))}
        </div>
        {!showResult && (
          <div className="xk-status">
            {proving ? (
              "proving…"
            ) : resetting ? (
              "resetting…"
            ) : lit >= TOTAL ? (
              <>
                <span className="xk-lime">Not it.</span> Verified — the number
                is still secret.
              </>
            ) : (
              "The winner was fixed before you arrived. Prove a guess."
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
