import { apiClient } from "./client";
import { Lead, Followup } from "@/types";

// NOTE: adjust these paths to exactly match curveleadbackend's Express routes
// (this mirrors the shape used by the web app's LeadsPage.jsx)

export async function fetchLeads(params?: { status?: string; q?: string }) {
  const { data } = await apiClient.get<Lead[]>("/leads", { params });
  return data;
}

export async function fetchLead(id: string) {
  const { data } = await apiClient.get<Lead>(`/leads/${id}`);
  return data;
}

export async function updateLeadStatus(id: string, status: Lead["status"]) {
  const { data } = await apiClient.patch<Lead>(`/leads/${id}`, { status });
  return data;
}

export async function fetchFollowups(leadId: string) {
  const { data } = await apiClient.get<Followup[]>(`/leads/${leadId}/followups`);
  return data;
}

export async function createFollowup(leadId: string, note: string, dueAt: string) {
  const { data } = await apiClient.post<Followup>(`/leads/${leadId}/followups`, {
    note,
    dueAt,
  });
  return data;
}
