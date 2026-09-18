import { apiClient } from "./client";

// NOTE: adjust these paths to exactly match curveleadbackend's Express routes
// (this mirrors the shape used by the web app's LeadsPage.jsx)

export interface LeadListItem {
  id: string;
  lead_number?: string;
  name: string;
  phone: string;
  email?: string;
  source?: string;
  stage?: string;
  lead_status?: string;
  lead_score?: "hot" | "warm" | "cold";
  assigned_to_name?: string;
  next_followup_at?: string;
  created_at: string;
}

export interface LeadDetails extends LeadListItem {
  business_name?: string;
  location?: string;
  address?: string;
  notes?: string;
  assigned_to?: string;
  deal_value?: number;
  expected_close_date?: string;
  lead_date?: string;
  updated_at?: string;
}

export interface LeadActivity {
  id: string;
  activity_type?: string;
  title: string;
  description?: string;
  created_by_name?: string;
  created_at: string;
}

export interface LeadFollowup {
  id: string;
  followup_type?: string;
  next_followup_at: string;
  notes?: string;
  is_completed: boolean;
  created_by_name?: string;
}

export interface LeadDetailsResponse {
  lead: LeadDetails;
  activities: LeadActivity[];
  followups: LeadFollowup[];
}

export interface LeadsPage {
  leads: LeadListItem[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

export async function fetchLeads(params?: {
  search?: string;
  score?: string;
  stage?: string;
  source?: string;
  assigned_to?: string;
  hide_stages?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await apiClient.get<LeadsPage>("/leads", { params });
  return data;
}

export async function fetchLeadDetails(id: string) {
  const { data } = await apiClient.get<LeadDetailsResponse>(`/leads/${id}`);
  return {
    lead: data.lead,
    activities: data.activities || [],
    followups: data.followups || [],
  };
}

export type UpdateLeadInput = Partial<Pick<LeadDetails,
  "name" | "phone" | "email" | "business_name" | "location" | "address" |
  "notes" | "source" | "stage" | "deal_value" | "expected_close_date"
>>;

export async function updateLeadDetails(id: string, input: UpdateLeadInput) {
  const { data } = await apiClient.put<{ lead: LeadDetails }>(`/leads/${id}`, input);
  return data.lead;
}

export async function updateLeadStage(id: string, stage: string, lostReason?: string) {
  // Changing stage always clears lead_status — a status belongs to a specific stage
  // (mirrors the web app's handleStageChange in LeadDetailPage.jsx).
  const { data } = await apiClient.put<{ lead: LeadDetails }>(`/leads/${id}`, {
    stage, lead_status: "", ...(lostReason && { lost_reason: lostReason }),
  });
  return data.lead;
}

export async function updateLeadStatus(id: string, leadStatus: string) {
  const { data } = await apiClient.put<{ lead: LeadDetails }>(`/leads/${id}`, { lead_status: leadStatus });
  return data.lead;
}

export type FollowupType = "call" | "whatsapp" | "visit" | "demo";

export interface CreateFollowupInput {
  followup_type: FollowupType;
  next_followup_at: string;
  notes?: string;
  meeting_url?: string;
}

export async function createLeadFollowup(leadId: string, input: CreateFollowupInput) {
  const { data } = await apiClient.post<{ followup: LeadFollowup }>(`/leads/${leadId}/followups`, input);
  return data.followup;
}

export interface TodayFollowup {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  lead_stage?: string;
  followup_type?: string;
  next_followup_at: string;
  notes?: string;
}

export async function fetchTodayFollowups(range?: { date_from?: string; date_to?: string }) {
  const { data } = await apiClient.get<{ followups: TodayFollowup[] }>("/leads/followups/today", { params: range });
  return data.followups || [];
}

export async function completeLeadFollowup(followupId: string, outcome?: string) {
  const { data } = await apiClient.put<{ followup: LeadFollowup }>(`/followups/${followupId}/complete`, { outcome });
  return data.followup;
}

export type ActivityLogType = "call" | "whatsapp" | "visit" | "other";

export interface LogActivityInput {
  notes: string;
  followup_type?: ActivityLogType;
  outcome?: string;
  next_followup_at?: string;
}

export async function logLeadActivity(leadId: string, input: LogActivityInput) {
  const { data } = await apiClient.post<{ followup: LeadFollowup }>(`/leads/${leadId}/note`, input);
  return data.followup;
}

export interface CreateLeadInput {
  name: string;
  phone: string;
  email?: string;
  location?: string;
  business_name?: string;
  address?: string;
  source: string;
  notes?: string;
  assigned_to?: string;
}

export async function createLead(input: CreateLeadInput) {
  const { data } = await apiClient.post<{ message: string; lead: { id: string } }>(
    "/leads",
    input
  );
  return data.lead;
}

export interface BulkUpdateLeadsInput {
  ids: string[];
  stage?: string;
  assigned_to?: string | null;
}

export async function bulkUpdateLeads(input: BulkUpdateLeadsInput) {
  const { data } = await apiClient.put<{ updated: number }>("/leads/bulk", input);
  return data.updated;
}

export async function bulkDeleteLeads(ids: string[]) {
  const { data } = await apiClient.delete<{ deleted: number }>("/leads/bulk", { data: { ids } });
  return data.deleted;
}

export interface ImportLeadsResult {
  message: string;
  inserted: number;
  skipped: number;
  errors: { row: number; name?: string; error: string }[];
  skip_reasons: { row: number; name?: string; reason: string }[];
}

export async function importLeadsFile(file: { uri: string; name: string; mimeType?: string }) {
  const formData = new FormData();
  formData.append("file", { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" } as unknown as Blob);
  const { data } = await apiClient.post<ImportLeadsResult>("/leads/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export type ContactActivityType = "call" | "whatsapp" | "email";

export async function trackContactActivity(leadId: string, type: ContactActivityType) {
  if (type === "call") {
    await apiClient.post(`/leads/${leadId}/call-click`);
  }
  // whatsapp/email clicks have no dedicated tracking endpoint on the backend;
  // the caller still records an optimistic local activity row for these.
}
