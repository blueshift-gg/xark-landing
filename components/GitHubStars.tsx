"use client";

import classNames from "classnames";
import { useEffect, useState } from "react";

// The repo the button points at and counts stars for. While it is private the
// GitHub API returns 404 to anonymous requests, so the button shows "GitHub"
// with no count until the repo is public.
const REPO = "blueshift-gg/xark";

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${n}`;
}

export function GitHubStars() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && typeof d.stargazers_count === "number") {
          setStars(d.stargazers_count);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <a
      className={classNames("xk-gh", !stars ? "px-[7px]! md:px-[12px]!" : "")}
      href={`https://github.com/${REPO}`}
      target="_blank"
      rel="noreferrer"
      aria-label="Star xark on GitHub"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
      {stars !== null && <span className="xk-gh-star">★</span>}
      <span className={classNames(!stars ? "hidden md:block" : "")}>{stars === null ? "GitHub" : fmt(stars)}</span>
    </a>
  );
}
