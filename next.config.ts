import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// Load .dev.vars into process.env so `next dev` reads the same secrets that
// `wrangler dev` / `pnpm preview` reads. This lets us use a single env file
// (.dev.vars) instead of maintaining both .dev.vars and .env.local.
try {
  for (const line of readFileSync(".dev.vars", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: import.meta.dirname,
  serverExternalPackages: ["@blueshift-gg/xark-wasm"],
};

const withMDX = createMDX();

export default withMDX(nextConfig);

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
