import { NextRequest, NextResponse } from "next/server";
import { ApiError, readRequestJson } from "@/lib/server/http";
import { createOnrampOrder, onrampError, parseOnrampInput } from "@/lib/server/onramp";
import { sessionAddress } from "@/lib/server/session";
import { hasPreviewAccess } from "@/lib/server/preview";

export const maxDuration = 20;
export async function POST(req: NextRequest) {
  try {
    if (!hasPreviewAccess(req.headers)) throw new ApiError(403, "Card deposits are not available yet");
    const input = parseOnrampInput(await readRequestJson(req, 1_024));
    // Only the wallet that signed in may create an order that pays into it.
    const signedIn = sessionAddress(req.headers);
    if (!signedIn || signedIn.toLowerCase() !== input.address.toLowerCase()) throw new ApiError(401, "Sign in with your wallet to continue");
    const { body, setCookie } = await createOnrampOrder(input, req.headers);
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store", ...(setCookie ? { "Set-Cookie": setCookie } : {}) } });
  } catch (error) {
    const result = onrampError(error);
    return NextResponse.json(result.body, { status: result.status, headers: result.headers });
  }
}
