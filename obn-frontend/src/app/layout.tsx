// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import HeaderBar from "@/components/HeaderBar";

// Use your deployed URL for correct OG/Twitter absolute URLs
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Olive Branch Network",
    template: "%s • Olive Branch Network",
  },
  description: "Stake OBN to support verified nonprofits and treasury growth.",
  openGraph: {
    title: "Olive Branch Network",
    description: "Stake OBN to support verified nonprofits and treasury growth.",
    url: baseUrl,
    siteName: "Olive Branch Network",
    type: "website",
    images: ["/og/default.png"], // place an image at public/og/default.png
  },
  twitter: {
    card: "summary_large_image",
    title: "Olive Branch Network",
    description: "Stake OBN to support verified nonprofits and treasury growth.",
    images: ["/og/default.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="earthtone">
      <body className="bg-base-100 text-base-content">
        <Providers>
          {/* Global header (fixed) */}
          <HeaderBar />
          {/* Push content below fixed header */}
          <div className="pt-16 min-h-screen">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
