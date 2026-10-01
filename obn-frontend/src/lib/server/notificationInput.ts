import { ApiError, isRecord } from "./http";

export type NotificationFilters = { exclude_fids?: number[]; following_fid?: number; minimum_user_score?: number };
export type NotificationInput = {
  title: string; body: string; targetUrl: string; targetPath?: string;
  targetFids: number[]; walletAddresses: string[]; broadcast: boolean; filters?: NotificationFilters;
};
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const positiveFid = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 9_999_999_999;
const invalid = () => new ApiError(400, "Invalid notification request");
export function notificationOrigin(): string {
  const url = new URL(process.env.BASE_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://dapp.olivebranch.network");
  if (url.protocol !== "https:" || url.username || url.password) throw new ApiError(503, "Notification service unavailable");
  return url.origin;
}
export function validTargetUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 1024 || /[\s\\\u0000-\u001f]/.test(value)) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && url.origin === notificationOrigin(); }
  catch { return false; }
}
export function validTargetPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500 || !value.startsWith("/") || value.startsWith("//") ||
      /[\s\\\u0000-\u001f]/.test(value) || /%(?:2f|5c|00|0a|0d|25)/i.test(value)) return false;
  try { return new URL(value, notificationOrigin()).origin === notificationOrigin(); } catch { return false; }
}
export function validAddresses(value: unknown, limit = 1000): value is string[] {
  return Array.isArray(value) && value.length <= limit && value.every((address) => typeof address === "string" && ADDRESS.test(address));
}
export function validFids(value: unknown): value is number[] {
  return Array.isArray(value) && value.length <= 100 && value.every(positiveFid);
}
export function parseNotificationInput(value: unknown): NotificationInput {
  if (!isRecord(value) || Object.keys(value).some((key) => ![
    "title", "body", "targetUrl", "targetPath", "targetFids", "walletAddresses", "broadcast", "filters",
  ].includes(key))) throw invalid();
  const { title, body, targetUrl, targetPath, targetFids = [], walletAddresses = [], broadcast = false, filters } = value;
  if (typeof title !== "string" || !title.trim() || title.length > 30 ||
      typeof body !== "string" || !body.trim() || body.length > 128 || !validTargetUrl(targetUrl) ||
      (targetPath !== undefined && !validTargetPath(targetPath)) || typeof broadcast !== "boolean" ||
      !validFids(targetFids) || !validAddresses(walletAddresses)) throw invalid();
  if (broadcast ? targetFids.length > 0 || walletAddresses.length > 0 : targetFids.length === 0 && walletAddresses.length === 0) throw invalid();
  if (filters !== undefined && (!isRecord(filters) || Object.keys(filters).some((key) => !["exclude_fids", "following_fid", "minimum_user_score"].includes(key)) ||
      (filters.exclude_fids !== undefined && !validFids(filters.exclude_fids)) ||
      (filters.following_fid !== undefined && !positiveFid(filters.following_fid)) ||
      (filters.minimum_user_score !== undefined && (typeof filters.minimum_user_score !== "number" || !Number.isFinite(filters.minimum_user_score) || filters.minimum_user_score < 0 || filters.minimum_user_score > 1)))) throw invalid();
  return { title, body, targetUrl, targetPath, broadcast, targetFids: [...new Set(targetFids)],
    walletAddresses: [...new Map(walletAddresses.map((address) => [address.toLowerCase(), address])).values()], filters: filters as NotificationFilters | undefined };
}
