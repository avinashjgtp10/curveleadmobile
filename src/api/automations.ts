import { apiClient } from "./client";

export type AutomationStatus = "Not Enrolled" | "In Progress" | "Completed" | "Cancelled" | "Converted" | "Lost";

export interface AutomationLead {
  id: string;
  name: string;
  phone: string;
  step: string;
  status: AutomationStatus;
  opted_out?: boolean;
  stage?: string;
  source?: string;
}

export interface AutomationSummary {
  total: number;
  inProgress: number;
  converted: number;
  lost: number;
}

export interface AutomationLeadsPage {
  leads: AutomationLead[];
  pagination: { total: number; page: number; pages: number };
  summary: AutomationSummary;
  steps: string[];
}

export interface AutomationSequence {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  steps?: { channel: string }[];
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger_type: "new_lead" | "campaign" | "lead_source" | "lead_status" | "stage_change";
  stage_name?: string;
  source_value?: string;
  status_value?: string;
  campaign_id?: string;
  sequence_id: string;
  sequence_name?: string;
  is_active: boolean;
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function fetchAutomationLeads(params: { page?: number; limit?: number; search?: string; status?: string; step?: string }) {
  const { data } = await apiClient.get("/automations/leads", { params });
  const pagination = data.pagination || {};
  const summary = data.summary || {};
  return {
    leads: (data.leads || []) as AutomationLead[],
    pagination: { total: toNumber(pagination.total), page: toNumber(pagination.page) || 1, pages: toNumber(pagination.pages) || 1 },
    summary: { total: toNumber(summary.total), inProgress: toNumber(summary.inProgress), converted: toNumber(summary.converted), lost: toNumber(summary.lost) },
    steps: (data.steps || []) as string[],
  } as AutomationLeadsPage;
}

export async function fetchSequences() {
  const { data } = await apiClient.get<{ sequences: AutomationSequence[] }>("/automations/sequences");
  return data.sequences || [];
}

export async function setSequenceActive(id: string, isActive: boolean) {
  await apiClient.put(`/automations/sequences/${id}`, { is_active: isActive });
}

export async function fetchRules() {
  const { data } = await apiClient.get<{ rules: AutomationRule[] }>("/automations/rules");
  return data.rules || [];
}

export async function setRuleActive(id: string, isActive: boolean) {
  await apiClient.put(`/automations/rules/${id}`, { is_active: isActive });
}

export function triggerLabel(rule: AutomationRule) {
  if (rule.trigger_type === "new_lead") return "New lead received";
  if (rule.trigger_type === "campaign") return "Lead comes from a campaign";
  if (rule.trigger_type === "lead_source") return `Source is ${rule.source_value || "-"}`;
  if (rule.trigger_type === "lead_status") return `Status changes to ${rule.status_value || "-"}`;
  return `Moves to stage ${rule.stage_name || "-"}`;
}
