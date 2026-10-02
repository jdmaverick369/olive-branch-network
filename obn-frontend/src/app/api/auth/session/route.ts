import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/server/http";
import { clearSessionCookie, sessionAddress } from "@/lib/server/session";

export function GET(req: NextRequest) {
  try {
    const address = sessionAddress(req.headers);
    // Signed out is a normal state for this probe, not an error.
    return NextResponse.json({ address: address ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: "Sign-in is unavailable" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

export function DELETE() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": clearSessionCookie() } });
}
