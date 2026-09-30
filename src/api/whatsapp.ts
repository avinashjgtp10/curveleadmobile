import { apiClient } from "./client";

export interface WhatsAppMessage {
  id: string;
  direction: "inbound" | "outbound";
  message: string;
  sent_at: string;
  status?: string;
  delivery?: { success?: boolean; error?: string };
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
