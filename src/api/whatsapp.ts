import { apiClient } from "./client";

export interface WhatsAppMessage {
  id: string;
  direction: "inbound" | "outbound";
  message: string;
  sent_at: string;
  status?: string;
  delivery?: { success?: boolean; error?: string };
}

export async function sendWhatsAppMessage(leadId: string, message: string) {
  const { data } = await apiClient.post<{ message: WhatsAppMessage; delivery?: { success?: boolean; error?: string } }>("/whatsapp/send", {
    lead_id: leadId,
    message,
  });
  return data;
}
