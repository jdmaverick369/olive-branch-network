import { NextResponse } from "next/server";
import { getTotalSupply, plainTextCacheHeaders as cacheHeaders } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const n = await getTotalSupply();
    return new NextResponse(n, { headers: cacheHeaders() });
  } catch {
    return new NextResponse("0", { status: 500, headers: cacheHeaders() });
  }
}
