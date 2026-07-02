import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import { siteMetadata } from "@/site.config";

import "./globals.css";

const grotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = siteMetadata;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${grotesk.variable} ${mono.variable}`}
    >
      <body className="antialiased">
        <RootProvider
          theme={{ forcedTheme: "dark" }}
          search={{ enabled: false }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
