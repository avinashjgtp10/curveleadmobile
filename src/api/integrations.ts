import { apiClient } from "./client";

export interface IntegrationSettings {
  meta_page_id: string;
  meta_page_name: string;
  meta_configured: boolean;
  google_configured: boolean;
  api_key: string | null;
  api_key_created_at: string | null;
  webhook_url: string;
  api_ingest_url: string;
  google_webhook_url: string;
  whatsapp_phone_number_id: string;
  whatsapp_configured: boolean;
}

export async function fetchIntegrationSettings() {
  const { data } = await apiClient.get<IntegrationSettings>("/integrations/settings");
  return data;
}

export interface UpdateIntegrationSettingsInput {
  whatsapp_phone_number_id?: string;
  whatsapp_access_token?: string;
}

export async function updateIntegrationSettings(input: UpdateIntegrationSettingsInput) {
  const { data } = await apiClient.put<IntegrationSettings>("/integrations/settings", input);
  return data;
}

export async function generateApiKey() {
  const { data } = await apiClient.post<{ api_key: string }>("/integrations/api-key");
  return data.api_key;
}

export async function revokeApiKey() {
  await apiClient.delete("/integrations/api-key");
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  fan_count?: number;
}

export async function connectFacebook(userToken: string) {
  const { data } = await apiClient.post<{ pages: FacebookPage[] }>("/integrations/facebook/auth", { user_token: userToken });
  return data.pages || [];
}

export async function connectFacebookPage(page: FacebookPage) {
  const { data } = await apiClient.post<{ message: string; webhook_status: string }>("/integrations/facebook/connect-page", {
    page_id: page.id, page_access_token: page.access_token, page_name: page.name,
  });
  return data;
}

export interface FacebookSyncResult {
  message: string;
  created: number;
  skipped: number;
}

export async function facebookSyncLeads() {
  const { data } = await apiClient.post<FacebookSyncResult>("/integrations/facebook/sync-leads");
  return data;
}

export async function syncAdInsights() {
  const { data } = await apiClient.post<{ message: string }>("/integrations/facebook/sync-ad-insights");
  return data;
}
