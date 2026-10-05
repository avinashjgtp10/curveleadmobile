import { apiClient } from "./client";

export interface WhatsAppMessage {
  id: string;
  direction: "inbound" | "outbound";
  message: string;
  sent_at: string;
  status?: string;
  message_type?: string;
  media_url?: string | null;
  delivery?: { success?: boolean; error?: string };
}

export interface InboxConversation {
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  message: string | null;
  sent_at: string | null;
  unread_count: number;
  ai_paused?: boolean;
  tags?: string[];
  assigned_to_name?: string | null;
}

export interface SendableWhatsAppTemplate {
  name: string;
  language: string;
  category?: string;
  body_text: string;
  variable_count: number;
  unsupported?: string;
}

export async function sendWhatsAppMessage(leadId: string, message: string) {
  const { data } = await apiClient.post<{ message: WhatsAppMessage; delivery?: { success?: boolean; error?: string } }>("/whatsapp/send", {
    lead_id: leadId,
    message,
  });
  return data;
}

export async function sendWhatsAppTemplate(leadId: string, input: {
  template_name: string;
  language_code: string;
  template_params: string[];
  body_text: string;
}) {
  const { data } = await apiClient.post<{ message: WhatsAppMessage; delivery?: { success?: boolean; error?: string } }>("/whatsapp/send", {
    lead_id: leadId,
    ...input,
  });
  return data;
}

export async function fetchSendableWhatsAppTemplates() {
  const { data } = await apiClient.get<{ templates: SendableWhatsAppTemplate[] }>("/whatsapp/templates/sendable");
  return data.templates || [];
}

export async function fetchInbox() {
  const { data } = await apiClient.get<{ ai_enabled?: boolean; conversations: InboxConversation[] }>("/whatsapp/inbox");
  return data.conversations || [];
}

export async function fetchConversation(leadId: string) {
  const { data } = await apiClient.get<{ messages: WhatsAppMessage[] }>(`/whatsapp/conversation/${leadId}`);
  return data.messages || [];
}

/** paused = true means a person has taken over, so AI and automated sequences stop replying. */
export async function setConversationAiPaused(leadId: string, paused: boolean) {
  await apiClient.put(`/whatsapp/conversation/${leadId}/ai`, { paused });
}

export async function markConversationsRead(leadIds: string[]) {
  await apiClient.put("/whatsapp/conversations/read", { lead_ids: leadIds });
}

/** WhatsApp only lets you free-text a customer for 24h after their last message; otherwise a template is required. */
export function lastInboundAt(messages: WhatsAppMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].direction === "inbound") {
      const time = new Date(messages[i].sent_at).getTime();
      return Number.isNaN(time) ? 0 : time;
    }
  }
  return 0;
}

export function replyWindowLeftMs(messages: WhatsAppMessage[]) {
  const last = lastInboundAt(messages);
  return last ? last + 24 * 60 * 60 * 1000 - Date.now() : -1;
}
