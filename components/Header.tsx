import Link from "next/link";

import { GitHubStars } from "@/components/GitHubStars";
import { Wordmark } from "@/components/Wordmark";

export function Header() {
  return (
    <nav className="xk-nav">
      <div className="xk-wrap xk-nav-in">
        <Link href="/" className="xk-brand" aria-label="xark">
          <Wordmark />
        </Link>
        <div className="xk-nav-links">
          <Link href="/docs">Docs</Link>
          <Link href="/examples">Examples</Link>
          <GitHubStars />
        </div>
      </div>
    </nav>
  );
}
