import { apiClient } from "./client";

export type CampaignSource = "meta_ads" | "google_ads" | "instagram" | "whatsapp" | "organic" | "referral" | "other";
export type CampaignStatus = "draft" | "active" | "paused" | "completed";
export type CampaignVerdict = "high_quality" | "high_volume_low_quality" | "underperforming" | "average" | "too_early" | "no_leads";

export interface Campaign {
  id: string;
  name: string;
  source: CampaignSource;
  status: CampaignStatus;
  budget?: number;
  actual_spend?: number;
  start_date?: string;
  end_date?: string;
  is_priority?: boolean;
  meta_campaign_id?: string;
  impressions?: number;
  clicks?: number;
  total_leads?: number;
  won_leads?: number;
  lost_leads?: number;
  cpl?: number;
  verdict?: CampaignVerdict;
  verdict_label?: string;
  verdict_reason?: string;
}

export interface CampaignAd {
  id: string;
  name?: string;
  meta_ad_id?: string;
  spend?: number;
  impressions?: number;
  clicks?: number;
  total_leads?: number;
  cpl?: number;
}

export interface CampaignLead {
  id: string;
  name: string;
  phone: string;
  stage?: string;
  lead_score?: "hot" | "warm" | "cold";
  created_at?: string;
}

export async function fetchCampaigns() {
  const { data } = await apiClient.get<{ campaigns: Campaign[] }>("/campaigns");
  return data.campaigns || [];
}

export interface CampaignDetail {
  campaign: Campaign;
  recentLeads: CampaignLead[];
}

export async function fetchCampaign(id: string, params?: { stage?: string; lead_score?: string; search?: string }) {
  const { data } = await apiClient.get<CampaignDetail>(`/campaigns/${id}`, { params });
  return data;
}

export async function fetchCampaignAds(id: string) {
  const { data } = await apiClient.get<{ ads: CampaignAd[] }>(`/campaigns/${id}/ads`);
  return data.ads || [];
}

export interface SaveCampaignInput {
  name: string;
  source: CampaignSource;
  budget?: string;
  start_date?: string;
  end_date?: string;
  status: CampaignStatus;
  is_priority: boolean;
}

export async function createCampaign(input: SaveCampaignInput) {
  const { data } = await apiClient.post<{ campaign: Campaign }>("/campaigns", input);
  return data.campaign;
}

export async function updateCampaign(id: string, input: SaveCampaignInput) {
  const { data } = await apiClient.put<{ campaign: Campaign }>(`/campaigns/${id}`, input);
  return data.campaign;
}

export async function deleteCampaign(id: string) {
  await apiClient.delete(`/campaigns/${id}`);
}
