import { fetchJsonBounded, isRecord } from "./server/http";
import { validAddresses, validTargetPath } from "./server/notificationInput";

const API = "https://dashboard.base.org/api/v1/notifications";
const MAX_USERS = 10_000;
export interface BaseAppUser { address: string; notificationsEnabled: boolean }
export interface SendBaseAppNotificationParams { appUrl: string; walletAddresses: string[]; title: string; message: string; targetPath?: string }
export interface BaseAppSendResult { walletAddress: string; sent: boolean; failureReason?: string }
export interface SendBaseAppNotificationResult {
  state: "success" | "error" | "invalid_request"; results?: BaseAppSendResult[]; sentCount?: number; failedCount?: number; error?: string;
}

/** A failed/truncated audience lookup must never be mistaken for an empty audience. */
export async function getBaseAppOptedInUsers(appUrl: string): Promise<string[]> {
  const apiKey = process.env.BASE_DASHBOARD_API_KEY;
  if (!apiKey) throw new Error("Base notification service unavailable");
  const addresses = new Map<string, string>();
  const cursors = new Set<string>();
  const deadline = AbortSignal.timeout(15_000);
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${API}/app/users`);
    url.searchParams.set("app_url", appUrl); url.searchParams.set("notification_enabled", "true"); url.searchParams.set("limit", "500");
    if (cursor) url.searchParams.set("cursor", cursor);
    const data = await fetchJsonBounded(url.toString(), { headers: { "x-api-key": apiKey }, signal: deadline });
    if (!isRecord(data) || data.success !== true || !Array.isArray(data.users) || data.users.length > 500) throw new Error("Invalid Base audience response");
    for (const user of data.users) {
      if (!isRecord(user) || !validAddresses([user.address]) || user.notificationsEnabled !== true) throw new Error("Invalid Base audience response");
      const address = user.address as string;
      addresses.set(address.toLowerCase(), address);
    }
    if (addresses.size > MAX_USERS) throw new Error("Base audience exceeds limit");
    if (data.nextCursor == null || data.nextCursor === "") return [...addresses.values()];
    if (typeof data.nextCursor !== "string" || data.nextCursor.length > 2048 || cursors.has(data.nextCursor)) throw new Error("Invalid Base audience cursor");
    cursors.add(data.nextCursor); cursor = data.nextCursor;
  }
  throw new Error("Base audience exceeds page limit");
}

export async function sendBaseAppNotification({ appUrl, walletAddresses, title, message, targetPath }: SendBaseAppNotificationParams): Promise<SendBaseAppNotificationResult> {
  if (typeof title !== "string" || !title.trim() || title.length > 30 || typeof message !== "string" || !message.trim() || message.length > 200 ||
      !validAddresses(walletAddresses, MAX_USERS) || (targetPath !== undefined && !validTargetPath(targetPath))) return { state: "invalid_request", error: "Invalid Base notification request" };
  const addresses = [...new Map(walletAddresses.map((address) => [address.toLowerCase(), address])).values()];
  if (addresses.length === 0) return { state: "success", results: [], sentCount: 0, failedCount: 0 };
  const apiKey = process.env.BASE_DASHBOARD_API_KEY;
  if (!apiKey) return { state: "error", error: "Base notification service unavailable", sentCount: 0, failedCount: addresses.length };
  const results: BaseAppSendResult[] = [];
  const deadline = AbortSignal.timeout(20_000);
  for (let start = 0; start < addresses.length; start += 1000) {
    const batch = addresses.slice(start, start + 1000);
    try {
      const data = await fetchJsonBounded(`${API}/send`, { method: "POST", signal: deadline,
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ app_url: appUrl, wallet_addresses: batch, title, message, ...(targetPath ? { target_path: targetPath } : {}) }),
      }, { maxBytes: 512 * 1024 });
      if (!isRecord(data) || typeof data.success !== "boolean" || !Array.isArray(data.results) || data.results.length !== batch.length) throw new Error("Invalid Base send response");
      const expected = new Set(batch.map((address) => address.toLowerCase()));
      const parsed: BaseAppSendResult[] = [];
      for (const result of data.results) {
        if (!isRecord(result) || typeof result.walletAddress !== "string" || typeof result.sent !== "boolean" || !expected.delete(result.walletAddress.toLowerCase())) throw new Error("Invalid Base send result");
        parsed.push({ walletAddress: result.walletAddress, sent: result.sent, ...(result.sent ? {} : { failureReason: "Provider did not confirm delivery" }) });
      }
      const sent = parsed.filter((result) => result.sent).length;
      if (data.sentCount !== sent || data.failedCount !== batch.length - sent || data.success !== (sent === batch.length)) throw new Error("Invalid Base send counts");
      results.push(...parsed);
    } catch {
      // Delivery may have happened before a timeout; never retry sends automatically.
      results.push(...batch.map((walletAddress) => ({ walletAddress, sent: false, failureReason: "Delivery could not be confirmed" })));
    }
  }
  const sentCount = results.filter((result) => result.sent).length;
  const failedCount = addresses.length - sentCount;
  return { state: failedCount ? "error" : "success", results, sentCount, failedCount };
}
