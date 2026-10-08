import { apiClient } from "./client";

export type AiAdDestination = "LEAD_FORM" | "WHATSAPP";
export type AiAdLanguage = "en" | "hi" | "mr";

export interface AiAdBrief {
  offer: string;
  goal?: string;
  location?: string;
  budget_per_day_inr: number;
  duration_days: number;
  language: AiAdLanguage;
  destination: AiAdDestination;
}

export interface AiAdDraftSummary {
  id: string;
  status: "draft" | "creating" | "created" | "activated" | "failed";
  campaign_name?: string;
  created_at?: string;
  brief?: Partial<AiAdBrief>;
}

export interface AiAdDraft extends AiAdDraftSummary {
  ai_reasoning?: string;
  error?: string;
  image?: { name?: string; url?: string };
  api_log?: { step: string; ok: boolean; id?: string; error?: string }[];
  draft?: AiMetaDraft;
  errors?: { field: string; message: string }[];
  warnings?: { field?: string; message: string }[];
}

export interface AiMetaDraft {
  campaign_name: string;
  primary_texts: string[];
  primary_text_index: number;
  headlines: string[];
  headline_index: number;
  cta: string;
  destination: AiAdDestination;
  location: string;
  radius_km: number | string;
  age_min: number | string;
  age_max: number | string;
  daily_budget_inr: number | string;
  duration_days: number | string;
  special_ad_categories?: string[];
  lead_form?: {
    existing_form_id?: string | null;
    privacy_policy_url?: string;
    questions?: unknown[];
  };
}

export async function fetchAiAdDrafts() {
  const { data } = await apiClient.get<{ drafts: AiAdDraftSummary[] }>("/ads/ai/drafts");
  return data.drafts || [];
}

export async function createAiAdDraft(brief: AiAdBrief) {
  const { data } = await apiClient.post<AiAdDraft>("/ads/ai/drafts", { brief }, { timeout: 60000 });
  return data;
}

export async function fetchAiAdDraft(id: string) {
  const { data } = await apiClient.get<AiAdDraft>(`/ads/ai/drafts/${id}`);
  return data;
}

export async function updateAiAdDraft(id: string, draft: AiMetaDraft) {
  const { data } = await apiClient.put<AiAdDraft>(`/ads/ai/drafts/${id}`, { draft });
  return data;
}

export async function uploadAiAdImage(id: string, file: { uri: string; name: string; mimeType?: string }) {
  const form = new FormData();
  form.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || "image/jpeg",
  } as unknown as Blob);
  const { data } = await apiClient.post<{ image: { name?: string; url?: string } }>(`/ads/ai/drafts/${id}/image`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.image;
}

export async function createAiAdOnMeta(id: string) {
  const { data } = await apiClient.post<AiAdDraft>(`/ads/ai/drafts/${id}/create`, {}, { timeout: 120000 });
  return data;
}

export async function activateAiAdDraft(id: string, confirm: string) {
  const { data } = await apiClient.post<AiAdDraft>(`/ads/ai/drafts/${id}/activate`, { confirm });
  return data;
}
