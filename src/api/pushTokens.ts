import { apiClient } from "./client";

/**
 * Backend contract required for push notifications (not yet implemented server-side —
 * see PUSH_NOTIFICATIONS.md). These calls will 404 until the backend adds them.
 *
 * POST /notifications/push-tokens
 *   body: { token: string; platform: "android" | "ios"; device_id?: string }
 *   Registers (or refreshes) an Expo push token for the authenticated user.
 *   Should upsert on (user_id, token) so re-registering the same token is a no-op.
 *
 * DELETE /notifications/push-tokens
 *   body: { token: string }
 *   Removes a single token (e.g. on logout) without affecting other devices/users
 *   that may have registered the same token previously.
 */

export async function registerPushToken(token: string, platform: "android" | "ios", deviceId?: string) {
  await apiClient.post("/notifications/push-tokens", { token, platform, device_id: deviceId });
}

export async function unregisterPushToken(token: string) {
  await apiClient.delete("/notifications/push-tokens", { data: { token } });
}
