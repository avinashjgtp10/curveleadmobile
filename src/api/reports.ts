import { apiClient } from "./client";

export type ReportPeriod = "today" | "this_week" | "this_month" | "last_month" | "this_year";

export interface ConversionReport {
  total_leads: number;
  won: number;
  stages: { stage: string; count: number }[];
}

export async function fetchConversion(period: ReportPeriod) {
  const { data } = await apiClient.get<ConversionReport>("/reports/conversion", { params: { period } });
  return data;
}

export interface SourceReportRow {
  source: string;
  total_leads: number;
}

export async function fetchBySource(period: ReportPeriod) {
  const { data } = await apiClient.get<{ sources: SourceReportRow[] }>("/reports/by-source", { params: { period } });
  return data.sources || [];
}

export interface StaffReportRow {
  name: string;
  total_leads: number;
  won: number;
  lost: number;
  ai_sent: number;
  manual_sent: number;
}

export async function fetchByStaff(period: ReportPeriod) {
  const { data } = await apiClient.get<{ staff: StaffReportRow[] }>("/reports/by-staff", { params: { period } });
  return data.staff || [];
}

export interface CampaignReportRow {
  name: string;
  source?: string;
  actual_spend?: string | number;
  total_leads: number;
  cpl: string | number;
  won?: number;
}

export async function fetchByCampaign(period: ReportPeriod) {
  const { data } = await apiClient.get<{ campaigns: CampaignReportRow[] }>("/reports/by-campaign", { params: { period } });
  return data.campaigns || [];
}

export interface FunnelStage {
  id: string;
  name: string;
  reached_count: number;
  drop_off_count?: number;
  drop_off_pct?: number;
}

export interface FunnelLeak {
  from_stage?: string;
  lost_count: number;
  lost_value: number;
}

export async function fetchFunnel(period: ReportPeriod) {
  const { data } = await apiClient.get<{ stages: FunnelStage[]; leaks: FunnelLeak[] }>("/reports/funnel", { params: { period } });
  return data;
}

export interface TimeInStageRow {
  stage: string;
  avg_seconds_in_stage: number | null;
  currently_in_stage: number;
}

export async function fetchTimeInStage(period: ReportPeriod) {
  const { data } = await apiClient.get<{ stages: TimeInStageRow[] }>("/reports/time-in-stage", { params: { period } });
  return data.stages || [];
}

export interface TimelinePoint {
  period: string;
  avg_response_seconds: number | null;
}

export async function fetchResponseTimeline(days: number) {
  const { data } = await apiClient.get<{ timeline: TimelinePoint[] }>("/reports/timeline", { params: { period: "daily", days } });
  return data.timeline || [];
}

export interface FollowupTrendPoint {
  period: string;
  scheduled: number;
  completed: number;
}

export async function fetchFollowupTrend(days: number) {
  const { data } = await apiClient.get<{ trend: FollowupTrendPoint[] }>("/reports/followup-trend", { params: { period: "daily", days } });
  return data.trend || [];
}

export interface LeadDetailRow {
  id: string;
  lead_number?: string;
  name: string;
  phone: string;
  stage?: string;
  assigned_to_name?: string;
  attachment_count?: number;
  created_at: string;
}

export interface LeadDetailParams {
  stage?: string;
  has_attachment?: "yes" | "no";
  stalled?: boolean;
  page?: number;
  limit?: number;
}

export async function fetchLeadDetailGrid(params: LeadDetailParams) {
  const { data } = await apiClient.get<{ leads: LeadDetailRow[]; pagination: { total: number; pages: number } }>("/leads", { params });
  return data;
}
