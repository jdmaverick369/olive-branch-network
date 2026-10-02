import { NextResponse } from "next/server";
import { issueNonce } from "@/lib/server/session";

export function GET() {
  const { nonce, setCookie } = issueNonce();
  return NextResponse.json({ nonce }, { headers: { "Cache-Control": "no-store", "Set-Cookie": setCookie } });
}
