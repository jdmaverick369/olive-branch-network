/**
 * Neynar-managed notifications for Mini Apps
 * Neynar handles all token management, so we don't need to store tokens
 */

export interface SendMiniAppNotificationParams {
  targetFids?: number[]; // Specific FIDs to target, or empty [] for all users with notifications enabled
  title: string; // Max 32 chars
  body: string; // Max 128 chars
  targetUrl: string; // Max 1024 chars, must be on same domain
  filters?: {
    exclude_fids?: number[];
    following_fid?: number;
    minimum_user_score?: number;
  };
}

export interface SendMiniAppNotificationResult {
  state: "success" | "error" | "invalid_request";
  error?: unknown;
  response?: unknown;
}

/**
 * Send notification via Neynar API
 * Neynar manages all notification tokens and permissions
 */
export async function sendMiniAppNotification({
  targetFids = [],
  title,
  body,
  targetUrl,
  filters,
}: SendMiniAppNotificationParams): Promise<SendMiniAppNotificationResult> {
  // Validate notification content
  if (title.length > 32) {
    return {
      state: "invalid_request",
      error: "Title exceeds 32 character limit",
    };
  }

  if (body.length > 128) {
    return {
      state: "invalid_request",
      error: "Body exceeds 128 character limit",
    };
  }

  if (targetUrl.length > 1024) {
    return {
      state: "invalid_request",
      error: "Target URL exceeds 1024 character limit",
    };
  }

  try {
    const neynarApiKey = process.env.NEYNAR_API_KEY;
    if (!neynarApiKey) {
      return {
        state: "error",
        error: "NEYNAR_API_KEY not configured",
      };
    }

    // Call Neynar API to send notifications
    // Note: the endpoint is plural ("notifications/", trailing slash) and the
    // request body nests title/body/target_url under a "notification" object —
    // the old singular/flat shape this used to call returned a confusing
    // PaymentRequired error rather than a 404, which looked like a billing
    // issue but was actually just hitting a stale endpoint.
    const response = await fetch("https://api.neynar.com/v2/farcaster/frame/notifications/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": neynarApiKey,
      },
      body: JSON.stringify({
        target_fids: targetFids,
        notification: {
          title,
          body,
          target_url: targetUrl,
        },
        filters,
      }),
    });

    const responseData = await response.json();

    if (response.status === 200) {
      return { state: "success", response: responseData };
    } else {
      return { state: "error", error: responseData };
    }
  } catch (error) {
    return { state: "error", error };
  }
}

/**
 * Send notification to specific FIDs
 */
export async function sendToSpecificUsers(
  fids: number[],
  title: string,
  body: string,
  targetUrl: string
): Promise<SendMiniAppNotificationResult> {
  return sendMiniAppNotification({
    targetFids: fids,
    title,
    body,
    targetUrl,
  });
}

/**
 * Send notification to all users with notifications enabled
 */
export async function broadcastNotification(
  title: string,
  body: string,
  targetUrl: string,
  filters?: SendMiniAppNotificationParams["filters"]
): Promise<SendMiniAppNotificationResult> {
  return sendMiniAppNotification({
    targetFids: [], // Empty = all users
    title,
    body,
    targetUrl,
    filters,
  });
}
