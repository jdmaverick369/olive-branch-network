import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Lets `npm run dev:mainnet` use its own build cache dir so it can run
  // alongside `npm run dev` (Next.js locks .next/dev/lock to one instance).
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // Strip console.log/debug/warn from production builds automatically,
  // instead of relying on manual cleanup that drifts out of sync (e.g. the
  // console.debug calls already back in NFTPrefetch.tsx). console.error stays
  // so real production errors are still visible.
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },

  // The app no longer has a landing page — the domain root (also the
  // Farcaster manifest homeUrl) goes straight to the dashboard.
  async redirects() {
    return [
      {
        source: "/",
        destination: "/stake-earn-contribute",
        permanent: false,
      },
      // Legacy route name — keep old shared links, casts, and bookmarks alive
      {
        source: "/stake-earn-give",
        destination: "/stake-earn-contribute",
        permanent: false,
      },
      {
        source: "/stake-earn-give/:poolId",
        destination: "/stake-earn-contribute/:poolId",
        permanent: false,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Required for Base Account popup (keys.coinbase.com).
          // Must NOT be "same-origin" — that blocks the popup.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "gray-impossible-shark-962.mypinata.cloud", pathname: "/ipfs/**" },
      { protocol: "https", hostname: "gateway.lighthouse.storage", pathname: "/ipfs/**" },
      { protocol: "https", hostname: "ipfs.io", pathname: "/ipfs/**" },
      { protocol: "https", hostname: "cloudflare-ipfs.com", pathname: "/ipfs/**" },
      { protocol: "https", hostname: "w3s.link", pathname: "/ipfs/**" },
      { protocol: "https", hostname: "dweb.link", pathname: "/ipfs/**" },
    ],
    formats: ["image/avif", "image/webp"],
  },

  // Optimize package bundling for server components (fixes thread-stream bundling issues)
  serverExternalPackages: ['thread-stream', 'pino', 'pino-pretty'],

  // Empty turbopack config to silence the webpack warning (we're using Turbopack)
  turbopack: {},
};

export default nextConfig;
