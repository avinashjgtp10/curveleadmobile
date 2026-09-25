import { apiClient } from "./client";

export interface WhatsAppTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
}

export interface WhatsAppTemplate {
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  category: string;
  language: string;
  components: WhatsAppTemplateComponent[];
}

export function templateComponent(template: WhatsAppTemplate, type: WhatsAppTemplateComponent["type"]) {
  return template.components?.find((component) => component.type === type);
}

export async function fetchWhatsAppTemplates() {
  const { data } = await apiClient.get<{ templates: WhatsAppTemplate[] }>("/whatsapp/broadcast/templates");
  return data.templates || [];
}

export interface CreateWhatsAppTemplateInput {
  name: string;
  category: string;
  language: string;
  body_text: string;
  examples: string[];
}

export async function createWhatsAppTemplate(input: CreateWhatsAppTemplateInput) {
  const { data } = await apiClient.post<{ status: string }>("/whatsapp/broadcast/templates", input);
  return data;
}
