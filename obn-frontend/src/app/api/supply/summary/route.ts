import { NextResponse } from "next/server";
import { getTotalSupply, getCirculatingSupply, cacheHeaders } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const [total, circulating] = await Promise.all([
      getTotalSupply(),
      getCirculatingSupply(),
    ]);
    return NextResponse.json({ total, circulating }, { headers: cacheHeaders() });
  } catch {
    return NextResponse.json(
      { total: "0", circulating: "0" },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
