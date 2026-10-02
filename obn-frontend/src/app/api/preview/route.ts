import { NextRequest, NextResponse } from "next/server";
import { hasPreviewAccess, isPreviewCode, previewCookie } from "@/lib/server/preview";

// GET /api/preview?code=… grants private preview access and opens the pool page.
// GET /api/preview reports whether this browser has access.
export function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  if (code === null) {
    return NextResponse.json({ access: hasPreviewAccess(req.headers) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!isPreviewCode(code)) {
    return NextResponse.json({ error: "Invalid preview link" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(null, { status: 303, headers: {
    Location: "/stake-earn-contribute/0", "Set-Cookie": previewCookie(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  } });
}
