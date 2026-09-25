import { apiClient } from "./client";

export interface Brochure {
  id: string;
  name: string;
  category: string;
  file_url: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  views?: number;
  times_shared?: number;
}

export async function fetchBrochures() {
  const { data } = await apiClient.get<{ brochures: Brochure[] }>("/brochures");
  return data.brochures || [];
}

export async function uploadBrochure(file: { uri: string; name: string; mimeType?: string }, name: string, category = "general") {
  const formData = new FormData();
  formData.append("file", { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" } as unknown as Blob);
  formData.append("name", name);
  formData.append("category", category);
  const { data } = await apiClient.post<{ brochure: Brochure }>("/brochures", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.brochure;
}

export async function deleteBrochure(id: string) {
  await apiClient.delete(`/brochures/${id}`);
}

export async function shareBrochure(brochureId: string, leadId: string) {
  const { data } = await apiClient.post<{ whatsapp_url: string | null; message: string }>(`/brochures/${brochureId}/share/${leadId}`);
  return data;
}
