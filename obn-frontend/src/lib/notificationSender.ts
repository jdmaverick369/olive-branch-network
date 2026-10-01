import { fetchJsonBounded, isRecord } from "./server/http";
import { validFids, validTargetUrl, type NotificationFilters } from "./server/notificationInput";

export interface SendMiniAppNotificationParams { targetFids?: number[]; title: string; body: string; targetUrl: string; filters?: NotificationFilters }
export interface SendMiniAppNotificationResult { state: "success" | "accepted" | "error" | "invalid_request"; error?: string; response?: unknown }

export async function sendMiniAppNotification({ targetFids = [], title, body, targetUrl, filters }: SendMiniAppNotificationParams): Promise<SendMiniAppNotificationResult> {
  if (!validFids(targetFids) || typeof title !== "string" || !title.trim() || title.length > 32 ||
      typeof body !== "string" || !body.trim() || body.length > 128 || !validTargetUrl(targetUrl)) return { state: "invalid_request", error: "Invalid notification request" };
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) return { state: "error", error: "Notification service unavailable" };
  try {
    let status = 0;
    const data = await fetchJsonBounded("https://api.neynar.com/v2/farcaster/frame/notifications/", {
      method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ target_fids: targetFids, notification: { title, body, target_url: targetUrl }, filters }),
    }, { onStatus: (code) => { status = code; } });
    if (!isRecord(data) || typeof data.campaign_id !== "string" || !/^[0-9a-f-]{36}$/i.test(data.campaign_id)) throw new Error("Invalid notification response");
    if (status === 202) return { state: "accepted", response: { campaign_id: data.campaign_id } };
    const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    if (status !== 200 || !count(data.success_count) || !count(data.failure_count) || !count(data.not_attempted_count)) throw new Error("Invalid notification counts");
    return { state: data.failure_count || data.not_attempted_count ? "error" : "success", response: {
      campaign_id: data.campaign_id, success_count: data.success_count, failure_count: data.failure_count, not_attempted_count: data.not_attempted_count,
    } };
  } catch { return { state: "error", error: "Notification delivery could not be confirmed" }; }
}
export function sendToSpecificUsers(fids: number[], title: string, body: string, targetUrl: string) {
  if (!fids.length) return Promise.resolve<SendMiniAppNotificationResult>({ state: "invalid_request", error: "Recipients are required" });
  return sendMiniAppNotification({ targetFids: fids, title, body, targetUrl });
}
export function broadcastNotification(title: string, body: string, targetUrl: string, filters?: NotificationFilters) {
  return sendMiniAppNotification({ targetFids: [], title, body, targetUrl, filters });
}
