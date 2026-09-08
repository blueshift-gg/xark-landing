import type { Metadata } from "next";

const siteTitle = "xark — prove anything, reveal nothing";
const siteDescription =
  "Full stack zero knowledge programming for Rust, verified on Solana.";

export const siteMetadata: Metadata = {
  metadataBase: new URL("https://xark.gg"),
  title: { template: "%s | xark", default: siteTitle },
  description: siteDescription,
  alternates: { canonical: "./" },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    siteName: "xark",
    url: "./",
    images: [
      {
        url: "/meta-image.png",
        width: 1800,
        height: 945,
        alt: siteTitle,
      },
    ],
  },
};
