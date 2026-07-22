"use client";

import InfiniteLogo from "./InfiniteLogo"

export function Footer() {
  return (
    <footer className="xk-footer">
      <div className="xk-wrap xk-foot-in">
        <span>
          xark — a <a href="https://blueshift.gg" target="_blank" className="xk-blueshift">
            <InfiniteLogo width={12} />Blueshift</a> project
        </span>
        <span>full stack zero knowledge programming for rust · unaudited · verified on solana</span>
      </div>
    </footer>
  );
}
