"use client";

import classNames from "classnames";
import { createTimeline, cubicBezier, splitText, stagger } from "animejs";
import type { TextSplitter } from "animejs";
import { Fragment, useEffect, useMemo, useRef } from "react";

import { anticipate, smooth } from "@/utils/easings";

type TextSplitBy = "lines" | "words" | "chars";

type HeadingLine = {
  text: string;
  className?: string;
  color?: string;
};

type HeadingRevealProps = {
  text?: string;
  lines?: HeadingLine[];
  headingLevel: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  baseDelay?: number;
  splitBy?: TextSplitBy;
  speed?: number;
  color?: string;
  cursorColor?: string;
};

function getSplitConfig(splitBy: TextSplitBy): Parameters<typeof splitText>[1] {
  const wrapClip = { wrap: "visible" as const };
  return {
    lines: splitBy === "lines" ? wrapClip : false,
    words: splitBy === "words" ? wrapClip : false,
    chars: splitBy === "chars" ? wrapClip : false,
  };
}

function getAriaLabel(text?: string, lines?: HeadingLine[]) {
  if (text) return text;
  return lines?.map((line) => line.text).join(" ") ?? "";
}

function getCursorKeyframes(cursorColor: string, finalColor: string) {
  return {
    backgroundColor: [
      "rgba(255,255,255,0)",
      "rgba(255,255,255,0)",
      cursorColor,
      cursorColor,
      cursorColor,
      "rgba(255,255,255,0)",
    ],
    color: [
      "rgba(255,255,255,0)",
      "rgba(255,255,255,0)",
      cursorColor,
      cursorColor,
      cursorColor,
      finalColor,
    ],
  };
}

export default function HeadingReveal({
  text,
  lines,
  headingLevel,
  className,
  baseDelay = 0,
  splitBy = "words",
  speed = 150,
  color = "#ffffff",
  cursorColor = "#99ff00",
}: HeadingRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);
  const splitRef = useRef<TextSplitter[]>([]);

  const HeadingTag = headingLevel;
  const resolvedLines = useMemo(
    () => lines ?? (text ? [{ text }] : []),
    [lines, text]
  );
  const ariaLabel = getAriaLabel(text, lines);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || hasAnimatedRef.current || resolvedLines.length === 0) return;

    const heading = container.firstElementChild as HTMLElement | null;
    if (!heading) return;

    const runSplitAndEffect = () => {
      if (hasAnimatedRef.current) return;
      hasAnimatedRef.current = true;
      container.style.visibility = "visible";

      const lineElements = Array.from(
        heading.querySelectorAll<HTMLElement>("[data-heading-line]")
      );
      const elementsToAnimate =
        lineElements.length > 0 ? lineElements : [heading];

      const timeline = createTimeline();
      let charOffset = 0;

      for (const [index, element] of elementsToAnimate.entries()) {
        const lineColor = resolvedLines[index]?.color ?? color;
        const lineStartDelay = baseDelay + (charOffset * speed) / 2;
        const split = splitText(element, getSplitConfig(splitBy));
        splitRef.current.push(split);

        split.addEffect(({ lines: splitLines, words, chars }) => {
          const targets =
            splitBy === "lines" ? splitLines : splitBy === "words" ? words : chars;
          if (!targets?.length) return () => {};

          timeline.add(
            targets,
            {
              ...getCursorKeyframes(cursorColor, lineColor),
              ease: cubicBezier(...smooth),
              duration: speed,
            },
            stagger(speed / 2, { start: lineStartDelay })
          );

          return () => {};
        });

        if (splitBy === "chars") {
          charOffset += resolvedLines[index]?.text.length ?? 0;
        } else if (splitBy === "words") {
          charOffset += resolvedLines[index]?.text.trim().split(/\s+/).length ?? 0;
        } else {
          charOffset += 1;
        }
      }

      timeline.init();
    };

    if (document.fonts.status === "loaded") {
      runSplitAndEffect();
    } else {
      document.fonts.ready.then(runSplitAndEffect);
    }

    return () => {
      for (const split of splitRef.current) {
        split.revert();
      }
      splitRef.current = [];
    };
  }, [
    headingLevel,
    splitBy,
    speed,
    baseDelay,
    color,
    cursorColor,
    resolvedLines,
  ]);

  return (
    <div ref={containerRef} style={{ visibility: "hidden" }}>
      <HeadingTag
        className={classNames(headingLevel, className)}
        aria-label={ariaLabel}
      >
        {resolvedLines.map((line, index) => (
          <Fragment key={`${line.text}-${index}`}>
            {index > 0 && <br />}
            <span
              data-heading-line
              className={line.className}
            >
              {line.text}
            </span>
          </Fragment>
        ))}
      </HeadingTag>
    </div>
  );
}
