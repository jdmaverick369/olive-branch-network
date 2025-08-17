// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "./providers";
import HeaderBar from "@/components/HeaderBar";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Olive Branch Network",
    template: "%s | Olive Branch Network",
  },
  description: "Stake OBN to support verified nonprofits and treasury growth.",
  openGraph: {
    title: "Olive Branch Network",
    description: "Stake OBN to support verified nonprofits and treasury growth.",
    url: "/",
    siteName: "Olive Branch Network",
    images: ["/og/default.png"], // add this image in /public/og/
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Olive Branch Network",
    description: "Stake OBN to support verified nonprofits and treasury growth.",
    images: ["/og/default.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="earthtone">
      <body className="bg-base-100 text-base-content">
        <Providers>
          {/* Global header (fixed) */}
          <HeaderBar />
          {/* push content below fixed header */}
          <div className="pt-16 min-h-screen">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
