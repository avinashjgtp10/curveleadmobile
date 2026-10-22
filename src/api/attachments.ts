import { apiClient } from "./client";

export interface LeadAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: "image" | "pdf" | "doc" | "audio" | "video" | "other";
  file_size: number;
  description?: string | null;
  uploaded_by_name?: string | null;
  uploaded_at: string;
}

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export async function fetchLeadAttachments(leadId: string) {
  const { data } = await apiClient.get<{ attachments: LeadAttachment[] }>(`/attachments/lead/${leadId}`);
  return data.attachments || [];
}

export async function uploadLeadAttachment(leadId: string, file: { uri: string; name: string; mimeType?: string }) {
  const formData = new FormData();
  formData.append("file", { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" } as unknown as Blob);
  const { data } = await apiClient.post<{ attachment: LeadAttachment }>(`/attachments/lead/${leadId}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.attachment;
}

export async function deleteLeadAttachment(leadId: string, attachmentId: string) {
  await apiClient.delete(`/attachments/lead/${leadId}/${attachmentId}`);
}
