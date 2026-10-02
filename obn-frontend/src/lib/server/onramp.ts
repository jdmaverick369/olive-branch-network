import { generateJwt } from "@coinbase/cdp-sdk/auth";
import { getPoolMeta } from "@/lib/pools";
import { ApiError, createResourceGuard, isRecord } from "./http";

// Coinbase Headless Onramp, embedded orders: one request creates an Apple Pay order and returns a
// payment link that the page embeds in an iframe. Coinbase itself collects and verifies the buyer's
// phone, email and one-time codes inside that frame.
// https://docs.cdp.coinbase.com/onramp/headless-onramp/overview
// https://docs.cdp.coinbase.com/api-reference/v2/rest-api/onramp/create-an-onramp-order
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ORDER_PATH = "/platform/v2/onramp/orders";
export const ONRAMP_MIN_USD = 5; // Coinbase's documented minimum purchase
export const ONRAMP_MAX_USD = 500;
const AUTH_TOKEN_COOKIE = "obn_onramp_auth";
const AUTH_TOKEN_TTL_S = 60 * 24 * 60 * 60; // Coinbase keeps returning-buyer tokens valid for 60 days.

export type OnrampInput = { address: string; amountUsd: number; poolId: number };

export function parseOnrampInput(value: unknown): OnrampInput {
  if (!isRecord(value) || Object.keys(value).some((key) => !["address", "amountUsd", "poolId"].includes(key))) {
    throw new ApiError(400, "Invalid onramp parameters");
  }
  const { address, amountUsd, poolId } = value;
  if (typeof address !== "string" || !ADDRESS.test(address) ||
      typeof amountUsd !== "number" || !Number.isFinite(amountUsd) ||
      amountUsd < ONRAMP_MIN_USD || amountUsd > ONRAMP_MAX_USD || Math.round(amountUsd * 100) !== amountUsd * 100 ||
      typeof poolId !== "number" || !Number.isSafeInteger(poolId) || !getPoolMeta(poolId)?.live) {
    throw new ApiError(400, "Invalid onramp parameters");
  }
  return { address, amountUsd, poolId };
}

// Coinbase rejects private and loopback addresses (e.g. ::1 from a local dev server).
const PRIVATE_IP = /^(?:::1?$|::ffff:|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|0\.|f[cd][0-9a-f]{2}:|fe80:)/i;

/** Coinbase binds the order to the buyer's IP; Vercel sets x-forwarded-for. */
export function clientIp(headers: Headers): string | undefined {
  const ip = (headers.get("x-forwarded-for")?.split(",")[0] ?? headers.get("x-real-ip") ?? "").trim();
  return /^[0-9a-fA-F:.]{2,45}$/.test(ip) && !PRIVATE_IP.test(ip) ? ip : undefined;
}

/**
 * Sandbox orders (partnerUserRef "sandbox-…") are simulated by Coinbase: nothing is charged and no
 * crypto is delivered. Enabled by ONRAMP_SANDBOX=true for local testing; never on the live production site.
 */
export function onrampSandbox() {
  return process.env.ONRAMP_SANDBOX === "true" && process.env.VERCEL_ENV !== "production";
}

/** The domain that embeds the payment iframe: the site, or localhost for local testing. */
export function checkoutDomain(headers: Headers) {
  const host = headers.get("host") ?? "";
  if (process.env.NODE_ENV !== "production" && /^(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(host)) return "localhost";
  return new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://dapp.olivebranch.network").hostname;
}

function readCookie(headers: Headers, name: string) {
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

/** Returning buyers skip Coinbase's one-time codes with the token from their last verified order. */
export function returningBuyerToken(headers: Headers) {
  const token = readCookie(headers, AUTH_TOKEN_COOKIE);
  return token && /^[A-Za-z0-9+/=_-]{16,4096}$/.test(token) ? token : undefined;
}

function buyerTokenCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${AUTH_TOKEN_COOKIE}=${token}; Path=/api/onramp; HttpOnly; SameSite=Strict; Max-Age=${AUTH_TOKEN_TTL_S}${secure}`;
}

// Coinbase's error codes, rewritten for people who have never used crypto.
const PROVIDER_ERRORS: Record<string, [number, string]> = {
  guest_transaction_limit: [429, "This is over your weekly Apple Pay limit with Coinbase. Try a smaller amount."],
  guest_transaction_count: [429, "You've reached Coinbase's limit on Apple Pay purchases for this account."],
  guest_region_forbidden: [400, "Apple Pay purchases through Coinbase aren't available in your region. They're currently US-only."],
  guest_permission_denied: [400, "Coinbase couldn't approve an Apple Pay purchase for you right now."],
  network_not_tradable: [400, "Buying USDC on Base isn't available in your region right now."],
  rate_limit_exceeded: [429, "Too many attempts. Please try again in a minute."],
  // Our Coinbase app isn't approved for live orders yet (e.g. pending Headless Onramp access).
  forbidden: [503, "Apple Pay deposits aren't switched on yet. Please check back soon."],
};

// Orders are single-use and per buyer: never cache or coalesce them.
const orders = createResourceGuard({ requestsPerMinute: 30, maxConcurrent: 4, coalesce: false });

async function requestOrder(input: OnrampInput, headers: Headers) {
  const apiKeyId = process.env.CDP_API_KEY_NAME;
  const apiKeySecret = process.env.CDP_API_KEY_PRIVATE_KEY;
  if (!apiKeyId || !apiKeySecret) throw new ApiError(503, "Card purchases are unavailable");
  const token = await generateJwt({ apiKeyId, apiKeySecret, requestMethod: "POST",
    requestHost: "api.cdp.coinbase.com", requestPath: ORDER_PATH, expiresIn: 120 });
  const ip = clientIp(headers);
  const returning = returningBuyerToken(headers);

  let response: Response;
  let text: string;
  try {
    response = await fetch(`https://api.cdp.coinbase.com${ORDER_PATH}`, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        paymentAmount: input.amountUsd.toFixed(2),
        paymentCurrency: "USD",
        purchaseCurrency: "USDC",
        paymentMethod: "GUEST_CHECKOUT_APPLE_PAY",
        destinationAddress: input.address,
        destinationNetwork: "base",
        // Ties orders to the wallet for Coinbase's transaction history; the prefix selects sandbox.
        partnerUserRef: `${onrampSandbox() ? "sandbox-" : ""}${input.address.toLowerCase()}`,
        domain: checkoutDomain(headers),
        ...(ip ? { clientIp: ip } : {}),
        ...(returning ? { userAuthToken: returning } : {}),
      }),
    });
    text = await response.text();
  } catch {
    throw new ApiError(502, "Card purchases are unavailable");
  }
  if (text.length > 64 * 1024) throw new ApiError(502, "Card purchases are unavailable");
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { /* Handled below. */ }

  if (!response.ok) {
    const code = isRecord(data) && typeof data.errorType === "string" ? data.errorType : "";
    const mapped = PROVIDER_ERRORS[code];
    if (mapped) throw new ApiError(mapped[0], mapped[1]);
    throw new ApiError(502, "Card purchases are unavailable");
  }

  const order = isRecord(data) && isRecord(data.order) ? data.order : null;
  const link = isRecord(data) && isRecord(data.paymentLink) ? data.paymentLink : null;
  const url = link && typeof link.url === "string" ? new URL(link.url) : null;
  if (!order || typeof order.orderId !== "string" || !url || url.protocol !== "https:" || url.hostname !== "pay.coinbase.com") {
    throw new ApiError(502, "Card purchases are unavailable");
  }
  // Sandbox Apple Pay on the web needs this flag; Coinbase ignores it for real orders, which never get it.
  if (onrampSandbox()) url.searchParams.set("useApplePaySandbox", "true");
  const decimal = (value: unknown) => typeof value === "string" && /^\d{1,12}(?:\.\d{1,18})?$/.test(value) ? value : null;
  const nextToken = isRecord(data) && typeof data.userAuthToken === "string" && /^[A-Za-z0-9+/=_-]{16,4096}$/.test(data.userAuthToken)
    ? data.userAuthToken : undefined;
  return {
    body: {
      orderId: order.orderId,
      paymentLinkUrl: url.toString(),
      paymentTotal: decimal(order.paymentTotal),
      purchaseAmount: decimal(order.purchaseAmount),
      sandbox: onrampSandbox(),
    },
    setCookie: nextToken ? buyerTokenCookie(nextToken) : undefined,
  };
}

export function createOnrampOrder(input: OnrampInput, headers: Headers) {
  return orders(input.address.toLowerCase(), () => requestOrder(input, headers));
}

export function onrampError(error: unknown) {
  const status = error instanceof ApiError ? error.status : 502;
  return { status, body: { error: error instanceof ApiError ? error.message : "Card purchases are unavailable" },
    headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } };
}
