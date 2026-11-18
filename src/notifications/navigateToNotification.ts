import { router } from "expo-router";

export interface NotificationRouteData {
  type?: string;
  lead_id?: string;
  lead_name?: string;
  lead_phone?: string;
  lead_stage?: string;
}

/** Push/server types for WhatsApp chat messages (new_messages, new_message, message_received, message_sent, whatsapp...). */
export function isMessageNotification(type?: string) {
  return !!type && /message|whatsapp|chat/i.test(type);
}

/**
 * Shared by the in-app notification list and push-notification tap handling, so both
 * route identically. Returns true if it navigated somewhere, false if the data didn't
 * match a known route (callers decide their own fallback for that case).
 */
export function navigateToNotification(data: NotificationRouteData): boolean {
  // A WhatsApp message goes straight to that lead's chat, like tapping a WhatsApp notification.
  if (data.lead_id && isMessageNotification(data.type)) {
    router.push({
      pathname: "/(app)/more/whatsapp",
      params: { leadId: data.lead_id, name: data.lead_name || "", phone: data.lead_phone || "", openAt: String(Date.now()) },
    });
    return true;
  }
  if (data.lead_id) {
    router.push({
      pathname: "/(app)/leads/[id]",
      params: {
        id: data.lead_id,
        name: data.lead_name || "",
        phone: data.lead_phone || "",
        stage: data.lead_stage || "new",
      },
    });
    return true;
  }
  if (data.type === "followup" || data.type === "followup_due") {
    router.push("/(app)/followups");
    return true;
  }
  return false;
}
