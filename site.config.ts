import type { Metadata } from "next";

export const siteMetadata: Metadata = {
  metadataBase: new URL("https://xark.blueshift.gg"),
  title: {
    template: "%s | xark",
    default: "xark — prove anything, reveal nothing",
  },
  description:
    "A Groth16 proving backend for Noir. Prove anything, reveal nothing — verified on Solana through the native alt_bn128 syscalls.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    url: "https://xark.blueshift.gg",
    title: "xark — prove anything, reveal nothing",
    description:
      "A Groth16 proving backend for Noir, verified on Solana.",
      images: [
        {
          url: "/meta-image.png",
          width: 1200,
          height: 630,
          alt: "xark — prove anything, reveal nothing",
        },
      ],
  },
};
