import { NextRequest, NextResponse } from "next/server";
import { readRequestJson } from "@/lib/server/http";
import { parseSwapInput, swapResponse, swapError } from "@/lib/server/swap";

export const maxDuration = 20;
export async function POST(req: NextRequest) {
  try {
    const input = parseSwapInput(await readRequestJson(req, 4_096));
    return NextResponse.json(await swapResponse("POST", input), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const result = swapError(error);
    return NextResponse.json(result.body, { status: result.status, headers: result.headers });
  }
}
