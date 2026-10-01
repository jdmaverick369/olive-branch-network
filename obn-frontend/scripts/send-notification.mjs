// Broadcast (or targeted) notification to both Farcaster Mini App users and
// Base App users in one call.
//
// Usage:
//   1. Edit the NOTIFICATION object below.
//   2. Run: node --env-file=.env.local scripts/send-notification.mjs
//
// broadcast:true explicitly sends to everyone opted in on BOTH platforms.
// For a targeted send, set broadcast:false and fill the intended recipient lists.
// Empty lists with broadcast:false SKIP that platform; they never broadcast.

const NOTIFICATION = {
  broadcast: true, // Set false before filling either targeted recipient list.
  title: "Your title here", // Keep ≤30 chars (Base App's limit; Neynar allows 32)
  body: "Your message here", // Keep ≤128 chars (Neynar's limit; Base App allows 200)
  targetUrl: "https://dapp.olivebranch.network", // Required — Farcaster deep link
  targetPath: "/", // Optional — Base App deep link, e.g. "/profile". Omit for app root.

  targetFids: [], // With broadcast:false, only these FIDs receive the message.
  walletAddresses: [], // With broadcast:false, only these addresses receive it.
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
if (!res.ok) process.exitCode = 1;
