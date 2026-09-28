import { apiClient } from "./client";

export type ReportPeriod = "today" | "this_week" | "this_month" | "last_month" | "this_year";

export interface ConversionStage {
  stage: string;
  count: number;
}

export interface ConversionSummary {
  total_leads?: number;
  won?: number;
  stages?: ConversionStage[];
}

export interface SourceBreakdown {
  source: string;
  total_leads: number;
}

export interface StaffPerformance {
  name: string;
  total_leads: number;
  won: number;
  lost: number;
  stalled?: number;
  ai_sent?: number;
  manual_sent?: number;
}

export interface CampaignPerformance {
  name: string;
  source?: string;
  actual_spend?: number;
  total_leads?: number;
  cpl?: number;
  won?: number;
}

export interface FunnelStage {
  id: string;
  name: string;
  reached_count: number;
  drop_off_count?: number;
  drop_off_pct?: number;
}

export interface FunnelLeak {
  from_stage: string;
  lost_count: number;
  lost_value: number;
}

export interface FunnelReport {
  stages: FunnelStage[];
  leaks: FunnelLeak[];
}

export interface TimeInStage {
  stage: string;
  avg_seconds_in_stage: number | null;
  currently_in_stage: number;
}

export interface ReportMessage {
  id: string;
  lead_name: string;
  lead_phone: string;
  direction: "inbound" | "outbound";
  message_type: string;
  template_name?: string;
  is_automated?: boolean;
  is_ai_generated?: boolean;
  status: "sent" | "delivered" | "read" | "failed" | string;
  sent_at: string;
}

export async function fetchConversion(period: ReportPeriod) {
  const { data } = await apiClient.get<ConversionSummary>("/reports/conversion", { params: { period } });
  return data;
}

export async function fetchBySource(period: ReportPeriod) {
  const { data } = await apiClient.get<{ sources: SourceBreakdown[] }>("/reports/by-source", { params: { period } });
  return data.sources || [];
}

export async function fetchByStaff(period: ReportPeriod) {
  const { data } = await apiClient.get<{ staff: StaffPerformance[] }>("/reports/by-staff", { params: { period } });
  return data.staff || [];
}

export async function fetchByCampaign(period: ReportPeriod) {
  const { data } = await apiClient.get<{ campaigns: CampaignPerformance[] }>("/reports/by-campaign", { params: { period } });
  return data.campaigns || [];
}

export async function fetchFunnel(period: ReportPeriod) {
  const { data } = await apiClient.get<FunnelReport>("/reports/funnel", { params: { period } });
  return { stages: data.stages || [], leaks: data.leaks || [] };
}

export async function fetchTimeInStage(period: ReportPeriod) {
  const { data } = await apiClient.get<{ stages: TimeInStage[] }>("/reports/time-in-stage", { params: { period } });
  return data.stages || [];
}

export async function fetchReportMessages(params: { page?: number; limit?: number; search?: string; status?: string; direction?: string }) {
  const { data } = await apiClient.get<{ messages: ReportMessage[]; pagination: { total: number; pages: number } }>("/reports/messages", { params });
  return data;
}
