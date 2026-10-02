import { createHmac, timingSafeEqual } from "node:crypto";

// Private preview for unreleased features (card deposits). Visiting
// /api/preview?code=PREVIEW_ACCESS_CODE stores a derived token in an HttpOnly cookie;
// changing PREVIEW_ACCESS_CODE revokes every issued cookie.
const COOKIE = "obn_preview";
export const PREVIEW_TTL_S = 30 * 24 * 60 * 60;

function code() {
  const value = process.env.PREVIEW_ACCESS_CODE;
  return value && value.length >= 16 ? value : undefined;
}

const token = (secret: string) => createHmac("sha256", secret).update("obn-preview-v1").digest("base64url");

function equal(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isPreviewCode(candidate: string | null) {
  const secret = code();
  return !!secret && !!candidate && equal(candidate, secret);
}

export function previewCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${token(code()!)}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${PREVIEW_TTL_S}${secure}`;
}

export function hasPreviewAccess(headers: Headers) {
  const secret = code();
  if (!secret) return false;
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === COOKIE) return equal(rest.join("="), token(secret));
  }
  return false;
}
