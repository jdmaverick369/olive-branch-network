// Broadcast (or targeted) notification to both Farcaster Mini App users and
// Base App users in one call.
//
// Usage:
//   1. Edit the NOTIFICATION object below.
//   2. Run: node --env-file=.env.local scripts/send-notification.mjs
//
// Leave targetFids and walletAddresses both empty to broadcast to everyone
// opted in on each platform. Fill either one in to target specific users
// instead of broadcasting.

const NOTIFICATION = {
  title: "Your title here", // Keep ≤30 chars (Base App's limit; Neynar allows 32)
  body: "Your message here", // Keep ≤128 chars (Neynar's limit; Base App allows 200)
  targetUrl: "https://dapp.olivebranch.network", // Required — Farcaster deep link
  targetPath: "/", // Optional — Base App deep link, e.g. "/profile". Omit for app root.

  targetFids: [], // Optional — specific Farcaster FIDs. Empty = everyone.
  walletAddresses: [], // Optional — specific wallet addresses. Empty = everyone.
};

const APP_URL = process.env.BASE_APP_URL ?? "https://dapp.olivebranch.network";
const API_KEY = process.env.NOTIFICATION_API_KEY;

if (!API_KEY) {
  console.error(
    "Missing NOTIFICATION_API_KEY. Run with:\n  node --env-file=.env.local scripts/send-notification.mjs"
  );
  process.exit(1);
}

if (NOTIFICATION.title.length > 30) {
  console.warn(`Warning: title is ${NOTIFICATION.title.length} chars — Base App will reject anything over 30.`);
}
if (NOTIFICATION.body.length > 128) {
  console.warn(`Warning: body is ${NOTIFICATION.body.length} chars — Neynar will reject anything over 128.`);
}

const res = await fetch(`${APP_URL}/api/notifications/send`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  },
  body: JSON.stringify(NOTIFICATION),
});

const data = await res.json();
console.log(JSON.stringify(data, null, 2));
