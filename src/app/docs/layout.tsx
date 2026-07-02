import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/Wordmark";
import { source } from "@/lib/source";

export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      themeSwitch={{ enabled: false }}
      nav={{ title: <Wordmark height={20} />, url: "/" }}
      githubUrl="https://github.com/blueshift-gg/xark"
    >
      {children}
    </DocsLayout>
  );
}
