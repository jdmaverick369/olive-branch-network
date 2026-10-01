import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendMiniAppNotification } from "@/lib/notificationSender";
import { getBaseAppOptedInUsers, sendBaseAppNotification } from "@/lib/baseAppNotificationSender";
import { ApiError, createResourceGuard, readRequestJson } from "@/lib/server/http";
import { parseNotificationInput } from "@/lib/server/notificationInput";

export const maxDuration = 60;
const send = createResourceGuard({ requestsPerMinute: 10, maxConcurrent: 1, coalesce: false });

/** Explicit broadcast:true sends to both opted-in audiences. Otherwise only nonempty target lists are sent. */
export async function POST(req: NextRequest) {
  const expectedKey = process.env.NOTIFICATION_API_KEY;
  if (!expectedKey) return NextResponse.json({ error: "Notification service is not configured" }, { status: 503 });
  const auth = req.headers.get("authorization");
  const supplied = Buffer.from(auth?.startsWith("Bearer ") ? auth.slice(7) : "");
  const expected = Buffer.from(expectedKey);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = parseNotificationInput(await readRequestJson(req, 128 * 1024));
    const result = await send("notification", async () => {
      const baseAppUrl = process.env.BASE_APP_URL;
      const needBase = input.broadcast || input.walletAddresses.length > 0;
      const needFarcaster = input.broadcast || input.targetFids.length > 0;
      if ((needBase && (!baseAppUrl || !process.env.BASE_DASHBOARD_API_KEY)) || (needFarcaster && !process.env.NEYNAR_API_KEY)) {
        throw new ApiError(503, "Notification service unavailable");
      }
      // Finish validation/configuration/audience lookup before either platform sends.
      const walletAddresses = input.broadcast ? await getBaseAppOptedInUsers(baseAppUrl!) : input.walletAddresses;
      const farcaster = needFarcaster ? await sendMiniAppNotification(input) : { state: "skipped" };
      const baseApp = needBase ? await sendBaseAppNotification({ appUrl: baseAppUrl!, walletAddresses,
        title: input.title, message: input.body, targetPath: input.targetPath }) : { state: "skipped" };
      return { farcaster, baseApp };
    });
    const failed = [result.farcaster, result.baseApp].some((item) => item.state === "error" || item.state === "invalid_request");
    const accepted = result.farcaster.state === "accepted";
    return NextResponse.json(result, { status: failed ? 502 : accepted ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 502;
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "Notification service unavailable" }, {
      status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) },
    });
  }
}
export async function GET() { return NextResponse.json({ status: "notification endpoint live" }); }
