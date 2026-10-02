import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createPublicClient, fallback, getAddress, http, isAddress, isHex, verifyMessage, type Address, type Hex } from "viem";
import { base } from "viem/chains";
import { parseSiweMessage } from "viem/siwe";
import { ApiError, isRecord } from "./http";

// Sign-In with Ethereum (EIP-4361) wallet sessions for APIs that act for a wallet.
// Nonce and session live in HttpOnly cookies; the session is HMAC-signed, so no store is needed.
const NONCE_COOKIE = "obn_siwe_nonce";
const SESSION_COOKIE = "obn_session";
const NONCE_TTL_S = 10 * 60;
export const SESSION_TTL_S = 24 * 60 * 60;
const CHAIN_ID = 8453;

function secret() {
  const value = process.env.AUTH_SESSION_SECRET;
  if (!value || value.length < 32) throw new ApiError(503, "Sign-in is unavailable");
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function cookie(name: string, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function readCookie(headers: Headers, name: string) {
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

/** Hosts a sign-in message may name: the site, this Vercel deployment, or (outside production) the dev host. */
function allowedDomains(headers: Headers) {
  const domains = new Set([new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://dapp.olivebranch.network").host]);
  if (process.env.VERCEL_URL) domains.add(process.env.VERCEL_URL);
  const host = headers.get("host");
  if (process.env.NODE_ENV !== "production" && host) domains.add(host);
  return domains;
}

export function issueNonce() {
  const nonce = randomBytes(16).toString("hex");
  return { nonce, setCookie: cookie(NONCE_COOKIE, nonce, NONCE_TTL_S) };
}

const rpc = process.env.BASE_RPC_URL || process.env.RPC_URL || "https://mainnet.base.org";
const client = createPublicClient({
  chain: base,
  transport: process.env.BASE_RPC_URL_ALT ? fallback([http(rpc), http(process.env.BASE_RPC_URL_ALT)]) : http(rpc),
});

/** Verifies a signed sign-in message (EOA and smart-wallet signatures) and returns a session cookie. */
export async function verifySignIn(body: unknown, headers: Headers, now = new Date()) {
  if (!isRecord(body) || Object.keys(body).some(key => key !== "message" && key !== "signature") ||
      typeof body.message !== "string" || body.message.length > 2_048 ||
      typeof body.signature !== "string" || !isHex(body.signature) || body.signature.length > 20_000) {
    throw new ApiError(400, "Invalid sign-in request");
  }
  const nonce = readCookie(headers, NONCE_COOKIE);
  const message = parseSiweMessage(body.message);
  const issuedAt = message.issuedAt?.getTime() ?? NaN;
  const expires = message.expirationTime?.getTime() ?? NaN;
  if (!nonce || message.nonce !== nonce || !message.address || !isAddress(message.address) ||
      !message.domain || !allowedDomains(headers).has(message.domain) || message.chainId !== CHAIN_ID ||
      message.uri !== `${message.domain.startsWith("localhost") ? "http" : "https"}://${message.domain}` ||
      !(issuedAt <= now.getTime() + 60_000 && now.getTime() - issuedAt <= NONCE_TTL_S * 1_000) ||
      !(expires > now.getTime() && expires - issuedAt <= NONCE_TTL_S * 1_000)) {
    throw new ApiError(401, "Sign-in expired or invalid. Please try again.");
  }
  // Plain wallet signatures verify locally; smart wallets (Base Account, ERC-1271/6492) need an RPC call.
  const signature = body.signature as Hex;
  const valid = await verifyMessage({ address: message.address, message: body.message, signature }).catch(() => false)
    || await client.verifySiweMessage({ message: body.message, signature, domain: message.domain, nonce, time: now }).catch(() => false);
  if (!valid) throw new ApiError(401, "Sign-in expired or invalid. Please try again.");

  const address = getAddress(message.address);
  const payload = Buffer.from(JSON.stringify({ a: address, e: Math.floor(now.getTime() / 1_000) + SESSION_TTL_S })).toString("base64url");
  return {
    address,
    setCookies: [cookie(SESSION_COOKIE, `${payload}.${sign(payload)}`, SESSION_TTL_S), cookie(NONCE_COOKIE, "", 0)],
  };
}

/** The signed-in wallet for this request, or undefined. */
export function sessionAddress(headers: Headers, now = Date.now()): Address | undefined {
  const [payload, mac] = (readCookie(headers, SESSION_COOKIE) ?? "").split(".");
  if (!payload || !mac) return undefined;
  const expected = Buffer.from(sign(payload));
  const supplied = Buffer.from(mac);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return undefined;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { a?: unknown; e?: unknown };
    return typeof session.a === "string" && isAddress(session.a) && typeof session.e === "number" && session.e * 1_000 > now
      ? getAddress(session.a) : undefined;
  } catch { return undefined; }
}

export const clearSessionCookie = () => cookie(SESSION_COOKIE, "", 0);
