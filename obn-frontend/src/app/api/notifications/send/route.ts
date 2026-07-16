import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendMiniAppNotification } from "@/lib/notificationSender";
import { getBaseAppOptedInUsers, sendBaseAppNotification } from "@/lib/baseAppNotificationSender";

/**
 * API endpoint to broadcast a notification to both Farcaster Mini App users
 * (via Neynar, addressed by FID) and Base App users (via Base Dashboard,
 * addressed by wallet address) in one call.
 *
 * POST /api/notifications/send
 *
 * Body options:
 * {
 *   "title": string (Neynar max 32 chars, Base App max 30 — keep it under 30 for both),
 *   "body": string (Neynar max 128 chars, Base App max 200 — keep it under 128 for both),
 *   "targetUrl": string (max 1024 chars, used as Neynar's target_url),
 *   "targetFids": number[] (optional, empty = all Farcaster users),
 *   "filters": { exclude_fids, following_fid, minimum_user_score } (optional, Neynar only),
 *   "walletAddresses": string[] (optional, omitted/empty = all opted-in Base App users),
 *   "targetPath": string (optional, Base App deep link, e.g. "/profile")
 * }
 */
export async function POST(req: NextRequest) {
  try {
    // This endpoint performs a privileged broadcast and must always fail closed.
    const authHeader = req.headers.get("authorization");
    const expectedKey = process.env.NOTIFICATION_API_KEY;

    if (!expectedKey) {
      return NextResponse.json({ error: "Notification service is not configured" }, { status: 503 });
    }

    const suppliedKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const expected = Buffer.from(expectedKey);
    const supplied = Buffer.from(suppliedKey);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      title,
      body: bodyText,
      targetUrl,
      targetFids = [],
      filters,
      walletAddresses,
      targetPath,
    } = body;

    // Validate required fields
    if (
      typeof title !== "string" ||
      typeof bodyText !== "string" ||
      typeof targetUrl !== "string" ||
      !title ||
      !bodyText ||
      !targetUrl
    ) {
      return NextResponse.json(
        { error: "Missing required fields: title, body, targetUrl" },
        { status: 400 }
      );
    }

    const farcasterResult = await sendMiniAppNotification({
      targetFids,
      title,
      body: bodyText,
      targetUrl,
      filters,
    });

    const baseAppUrl = process.env.BASE_APP_URL;
    const baseAppResult = baseAppUrl
      ? await sendBaseAppNotification({
          appUrl: baseAppUrl,
          walletAddresses:
            Array.isArray(walletAddresses) && walletAddresses.length > 0
              ? walletAddresses
              : await getBaseAppOptedInUsers(baseAppUrl),
          title,
          message: bodyText,
          targetPath,
        })
      : { state: "error" as const, error: "BASE_APP_URL not configured" };

    return NextResponse.json({ farcaster: farcasterResult, baseApp: baseAppResult });
  } catch (error) {
    console.error("Error sending notification:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "notification endpoint live" });
}
