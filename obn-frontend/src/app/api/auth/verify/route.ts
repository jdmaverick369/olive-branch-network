import { NextRequest, NextResponse } from "next/server";
import { ApiError, readRequestJson } from "@/lib/server/http";
import { verifySignIn } from "@/lib/server/session";
import { hasPreviewAccess } from "@/lib/server/preview";

export const maxDuration = 20;
export async function POST(req: NextRequest) {
  try {
    if (!hasPreviewAccess(req.headers)) throw new ApiError(403, "Card deposits are not available yet");
    const { address, setCookies } = await verifySignIn(await readRequestJson(req, 24_576), req.headers);
    const headers = new Headers({ "Cache-Control": "no-store" });
    for (const value of setCookies) headers.append("Set-Cookie", value);
    return NextResponse.json({ address }, { headers });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "Sign-in is unavailable" },
      { status, headers: { "Cache-Control": "no-store" } });
  }
}
