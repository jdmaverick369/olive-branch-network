// MiniApps embed the interactive app in trusted host frames. The read-only
// impact widget has a separate policy so external sites can keep embedding it.
const miniAppAncestors = [
  "'self'",
  "https://farcaster.xyz", "https://*.farcaster.xyz",
  "https://warpcast.com", "https://*.warpcast.com",
  "https://base.org", "https://*.base.org",
  "https://coinbase.com", "https://*.coinbase.com",
];

export function appSecurityPolicy(extraOrigins = ""): string {
  const additional = extraOrigins.split(/\s+/).filter(Boolean).map((origin) => {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password ||
        !/^[a-z0-9.-]+$/i.test(url.hostname)) {
      throw new Error("FRAME_ANCESTOR_ORIGINS must contain space-separated HTTPS origins without paths");
    }
    return origin;
  });
  // Resource/script restrictions need separate nonce or hash coverage for Next
  // hydration and injected wallets. These directives are enforced immediately
  // without weakening wallet popup or script execution through unsafe-eval.
  return [
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    `frame-ancestors ${[...new Set([...miniAppAncestors, ...additional])].join(" ")}`,
  ].join("; ");
}

export const widgetSecurityPolicy = "base-uri 'self'; object-src 'none'; form-action 'none'; frame-ancestors https:";
