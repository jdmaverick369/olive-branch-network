import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "gateway.lighthouse.storage", pathname: "/ipfs/**" },
      { protocol: "https", hostname: "ipfs.io", pathname: "/ipfs/**" },
      { protocol: "https", hostname: "cloudflare-ipfs.com", pathname: "/ipfs/**" },
      { protocol: "https", hostname: "gateway.pinata.cloud", pathname: "/ipfs/**" },
      { protocol: "https", hostname: "*.nftstorage.link", pathname: "/**" },
    ],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
