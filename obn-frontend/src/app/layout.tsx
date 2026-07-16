// src/app/layout.tsx
import "./globals.css";
import "@coinbase/onchainkit/styles.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import HeaderBar from "@/components/HeaderBar";
import FarcasterMiniAppReady from "@/components/FarcasterMiniAppReady";
import InteractionRescue from "@/components/InteractionRescue";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Toaster } from "sonner";
import NFTPrefetch from "@/components/NFTPrefetch";
import { XDebugOverlay } from "@/components/XDebugOverlay";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const BOOT_GREEN = "#0D9921";

// Use the public site URL if present; fallback to localhost in dev
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Olive Branch Network",
    template: "%s | Olive Branch Network",
  },
  description: "Stake OBN to support verified nonprofits and charities.",
  openGraph: {
    title: "Olive Branch Network",
    description: "Stake OBN to support verified nonprofits and charities.",
    url: baseUrl,
    siteName: "Olive Branch Network",
    images: ["/og/default.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Olive Branch Network",
    description: "Stake OBN to support verified nonprofits and charities.",
    images: ["/og/default.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/olive-branch-network-192.png", type: "image/png" }],
  },

  other: {
    "base:app_id": "68d78000554d6e846c6a6a15",
    "talentapp:project_verification": "43f88c0bab49f182ede77363a2790910438c19961255330d2ed02bd6119202327d28286255a444d189f314257c53a329ba8a793fba4e440a6959e8f07cd1b124",
    "fc:app_manifest": "https://dapp.olivebranch.network/.well-known/farcaster.json",
    "fc:miniapp": JSON.stringify({
      version: "1",
      imageUrl: "https://dapp.olivebranch.network/og/frame-obn.png",
      aspectRatio: "3:2",
      button: {
        title: "Connect to OBN App",
        action: {
          type: "launch_frame",
          name: "Olive Branch Network",
          url: "https://dapp.olivebranch.network",
          splashImageUrl: "https://dapp.olivebranch.network/splash.png",
          splashBackgroundColor: BOOT_GREEN,
        },
      },
    }),
    "fc:frame": JSON.stringify({
      version: "1",
      imageUrl: "https://dapp.olivebranch.network/og/frame-obn.png",
      aspectRatio: "3:2",
      button: {
        title: "Connect to OBN App",
        action: {
          type: "launch_frame",
          name: "Olive Branch Network",
          url: "https://dapp.olivebranch.network",
          splashImageUrl: "https://dapp.olivebranch.network/splash.png",
          splashBackgroundColor: BOOT_GREEN,
        },
      },
    }),
  },
};

export const viewport: Viewport = {
  themeColor: BOOT_GREEN,
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

function ThemeInitScript() {
  const js = `
  (function() {
    try {
      var key = 'obnTheme';
      var saved = localStorage.getItem(key);
      var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      var next = (saved === 'dark' || saved === 'light') ? saved : (prefersDark ? 'dark' : 'light');

      if (next === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');

      document.documentElement.setAttribute('data-theme', next === 'dark' ? 'dark' : 'earthtone');
    } catch(_) {}

    document.documentElement.setAttribute('data-scroll-behavior', 'smooth');
  })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

/**
 * ✅ Measures the fixed HeaderBar height and sets CSS var --obn-header-h
 * so content padding always matches it (no overlap, no hardcoded pt-16).
 *
 * Does NOT require any changes to HeaderBar.
 */
// Embed routes (iframe widgets on external sites) shouldn't show the app's
// branded green boot-splash background — it visibly flashes before the
// page's own effects can paint over it. Runs synchronously before first
// paint, same as ThemeInitScript/HeaderHeightScript.
function EmbedBootScript() {
  const js = `
  (function() {
    try {
      if (location.pathname.indexOf('/embed') === 0) {
        document.documentElement.setAttribute('data-embed', '1');
      }
    } catch(_) {}
  })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

function HeaderHeightScript() {
  const js = `
  (function() {
    function findHeaderEl() {
      // HeaderBar's outer div has "fixed top-0 left-0 w-full ... z-50"
      // We'll find the first element that matches those classes reasonably.
      // Fallback to any fixed top-0 w-full element.
      return (
        document.querySelector('div.fixed.top-0.left-0.w-full.z-50') ||
        document.querySelector('div.fixed.top-0.left-0.w-full') ||
        document.querySelector('div.fixed.top-0.w-full') ||
        null
      );
    }

    function setVar() {
      var el = findHeaderEl();
      if (!el) return;
      var h = el.getBoundingClientRect().height || 0;
      // Add safe-area inset top if any (mostly iOS), so content never hides under status bar
      var safeTop = 0;
      try {
        safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
      } catch (_) {}
      document.documentElement.style.setProperty('--obn-header-h', (h) + 'px');
    }

    // initial & after layout settles
    setVar();
    setTimeout(setVar, 0);
    setTimeout(setVar, 120);
    setTimeout(setVar, 500);

    // resize/orientation
    window.addEventListener('resize', setVar, { passive: true });

    // observe size changes if supported
    if (window.ResizeObserver) {
      var el = findHeaderEl();
      if (el) {
        var ro = new ResizeObserver(setVar);
        ro.observe(el);
      }
    }
  })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="earthtone"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <meta name="base:app_id" content="68d78000554d6e846c6a6a15" />
        <ThemeInitScript />

        {/* ✅ default fallback if script hasn't measured yet */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root { --obn-header-h: 64px; }
            `,
          }}
        />

        <HeaderHeightScript />
        <EmbedBootScript />

      </head>

      <body
        className={`${inter.variable} bg-base-100 text-base-content dark:bg-gray-950 dark:text-gray-50`}
      >
        <Providers>
          <InteractionRescue />
          <NFTPrefetch />

          <FarcasterMiniAppReady />
          {process.env.NODE_ENV === "development" && <XDebugOverlay />}
          <HeaderBar />

          {/* ✅ THIS replaces pt-16 but stays correct across devices */}
          <div style={{ paddingTop: "var(--obn-header-h)" }}>
            {children}
          </div>
        </Providers>

        <Analytics />
        <SpeedInsights />
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: 'var(--card-bg)',
              color: 'var(--card-text)',
              border: '1px solid var(--card-border)',
            },
          }}
        />
      </body>
    </html>
  );
}
