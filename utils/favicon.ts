const DEFAULT_FAVICON = "/favicon.svg";
const PROOF_FAVICON = "/favicon-proof.svg";

function setFavicon(href: string) {
  for (const rel of ["icon", "shortcut icon"] as const) {
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement("link");
      link.rel = rel;
      if (rel === "icon") link.type = "image/svg+xml";
      document.head.appendChild(link);
    }
    link.href = href;
  }
}

export function setDefaultFavicon() {
  setFavicon(DEFAULT_FAVICON);
}

export function setProofFavicon() {
  setFavicon(PROOF_FAVICON);
}
