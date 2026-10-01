import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/server/http";
import { parseSwapInput, swapResponse, swapError } from "@/lib/server/swap";

export const maxDuration = 20;
export async function GET(req: NextRequest) {
  try {
    if (req.url.length > 2_048) throw new ApiError(400, "Invalid swap parameters");
    const params = new URL(req.url).searchParams;
    const body = Object.fromEntries(params);
    if (Object.keys(body).length !== params.size) throw new ApiError(400, "Duplicate swap parameters");
    const input = parseSwapInput({ ...body, slippageBps: body.slippageBps === undefined ? 100 : Number(body.slippageBps) });
    return NextResponse.json(await swapResponse("GET", input), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const result = swapError(error);
    return NextResponse.json(result.body, { status: result.status, headers: result.headers });
  }
}
