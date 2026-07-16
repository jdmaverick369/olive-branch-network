/**
 * Base Dashboard notifications for the Base App
 * https://docs.base.org/base-app/build-with-base-app/notifications
 *
 * Separate audience from Neynar/Farcaster (src/lib/notificationSender.ts):
 * users are addressed by wallet address here, not FID, and only users who
 * opened this app inside the Base App (not Warpcast/other clients) receive
 * these notifications.
 */

const BASE_DASHBOARD_API = "https://dashboard.base.org/api/v1/notifications";
const MAX_ADDRESSES_PER_REQUEST = 1000;

export interface BaseAppUser {
  address: string;
  notificationsEnabled: boolean;
}

export interface SendBaseAppNotificationParams {
  appUrl: string;
  walletAddresses: string[]; // 1-1000 per underlying request; longer lists are batched
  title: string; // Max 30 chars
  message: string; // Max 200 chars
  targetPath?: string; // Must start with "/" if provided
}

export interface BaseAppSendResult {
  walletAddress: string;
  sent: boolean;
  failureReason?: string;
}

export interface SendBaseAppNotificationResult {
  state: "success" | "error" | "invalid_request";
  results?: BaseAppSendResult[];
  sentCount?: number;
  failedCount?: number;
  error?: unknown;
}

/**
 * Fetch every wallet address that has pinned this app and opted in to
 * notifications, paginating through the full result set.
 */
export async function getBaseAppOptedInUsers(appUrl: string): Promise<string[]> {
  const apiKey = process.env.BASE_DASHBOARD_API_KEY;
  if (!apiKey) return [];

  const addresses: string[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${BASE_DASHBOARD_API}/app/users`);
    url.searchParams.set("app_url", appUrl);
    url.searchParams.set("notification_enabled", "true");
    url.searchParams.set("limit", "500");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), { headers: { "x-api-key": apiKey } });
    const data = await res.json();
    if (!data.success) break;

    addresses.push(...(data.users as BaseAppUser[]).map((u) => u.address));
    cursor = data.nextCursor;
  } while (cursor);

  return addresses;
}

/**
 * Send a notification to one or more Base App wallet addresses. Requests
 * larger than 1,000 addresses are split into multiple calls automatically.
 */
export async function sendBaseAppNotification({
  appUrl,
  walletAddresses,
  title,
  message,
  targetPath,
}: SendBaseAppNotificationParams): Promise<SendBaseAppNotificationResult> {
  if (title.length > 30) {
    return { state: "invalid_request", error: "title exceeds 30 character limit" };
  }
  if (message.length > 200) {
    return { state: "invalid_request", error: "message exceeds 200 character limit" };
  }
  if (targetPath && !targetPath.startsWith("/")) {
    return { state: "invalid_request", error: "targetPath must start with /" };
  }
  if (walletAddresses.length === 0) {
    return { state: "success", results: [], sentCount: 0, failedCount: 0 };
  }

  const apiKey = process.env.BASE_DASHBOARD_API_KEY;
  if (!apiKey) {
    return { state: "error", error: "BASE_DASHBOARD_API_KEY not configured" };
  }

  const batches: string[][] = [];
  for (let i = 0; i < walletAddresses.length; i += MAX_ADDRESSES_PER_REQUEST) {
    batches.push(walletAddresses.slice(i, i + MAX_ADDRESSES_PER_REQUEST));
  }

  const results: BaseAppSendResult[] = [];
  let sentCount = 0;
  let failedCount = 0;

  for (const batch of batches) {
    try {
      const res = await fetch(`${BASE_DASHBOARD_API}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          app_url: appUrl,
          wallet_addresses: batch,
          title,
          message,
          ...(targetPath ? { target_path: targetPath } : {}),
        }),
      });
      const data = await res.json();

      if (Array.isArray(data.results)) results.push(...data.results);
      sentCount += data.sentCount ?? 0;
      failedCount += data.failedCount ?? 0;
    } catch (error) {
      failedCount += batch.length;
      results.push(
        ...batch.map((address) => ({
          walletAddress: address,
          sent: false,
          failureReason: error instanceof Error ? error.message : String(error),
        }))
      );
    }
  }

  return {
    state: failedCount === 0 ? "success" : "error",
    results,
    sentCount,
    failedCount,
  };
}
