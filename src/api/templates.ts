import { apiClient } from "./client";

export type TemplateChannel = "whatsapp" | "sms" | "email";

export interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  channel: TemplateChannel;
  message: string;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export async function fetchTemplates() {
  const { data } = await apiClient.get<{ templates: MessageTemplate[] }>("/templates");
  return data.templates || [];
}

export interface SaveTemplateInput {
  name: string;
  category: string;
  channel: TemplateChannel;
  message: string;
}

export async function createTemplate(input: SaveTemplateInput) {
  const { data } = await apiClient.post<{ template: MessageTemplate }>("/templates", input);
  return data.template;
}

export async function updateTemplate(id: string, input: Partial<SaveTemplateInput>) {
  const { data } = await apiClient.put<{ template: MessageTemplate }>(`/templates/${id}`, input);
  return data.template;
}

export async function deleteTemplate(id: string) {
  await apiClient.delete(`/templates/${id}`);
}

export async function sendTemplate(id: string, leadId?: string) {
  const { data } = await apiClient.post<{ message: string; whatsappUrl: string | null }>(`/templates/${id}/send`, { lead_id: leadId });
  return data;
}
