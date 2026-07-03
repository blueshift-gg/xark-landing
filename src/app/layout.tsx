import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";

import { siteMetadata } from "@/site.config";

import "./globals.css";

const prolinea = localFont({
  src: [
    {
      path: "../../public/fonts/Prolinea-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/Prolinea-Medium.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-prolinea",
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
      className={`${prolinea.variable} ${mono.variable}`}
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
