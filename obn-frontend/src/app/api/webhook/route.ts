import { NextRequest, NextResponse } from "next/server";

/**
 * Webhook handler for Neynar frame notifications
 * When using Neynar for notifications, they handle all the complexity:
 * - Token management (creation, rotation, revocation)
 * - Permission tracking (enabled/disabled)
 * - Event delivery (add/remove)
 *
 * This endpoint can remain empty or log events for analytics
 */
export async function POST(req: NextRequest) {
  try {
    await req.json();

    // Always return 200 OK to acknowledge receipt
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Webhook error:", error);
    // Return 200 anyway to avoid Neynar retries
    return NextResponse.json({ status: "ok" });
  }
}

export async function GET() {
  return NextResponse.json({ status: "webhook endpoint live" });
}
