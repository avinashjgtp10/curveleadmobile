import { apiClient } from "./client";

// ---- Assignment rules (Settings > Assignment) -------------------------------------------------

export interface AssignmentRule {
  id: string;
  name: string;
  sources?: string[];
  campaign_ids?: string[];
  location_contains?: string;
  staff_ids?: string[];
  assign_to_user_id?: string | null;
  assign_to_team_id?: string | null;
  assign_to_user_name?: string | null;
  assign_to_team_name?: string | null;
  sequence_id?: string | null;
  sequence_name?: string | null;
  is_active: boolean;
}

export interface SaveAssignmentRuleInput {
  name: string;
  sources: string[];
  campaign_ids: string[];
  location_contains: string;
  staff_ids?: string[];
  assign_to_user_id?: string;
  assign_to_team_id?: string;
  sequence_id?: string;
}

export interface Team {
  id: string;
  name: string;
}

export const LEAD_SOURCES = ["meta_ads", "google_ads", "whatsapp", "referral", "manual", "website", "walkin"];

export async function fetchAssignmentRules() {
  const { data } = await apiClient.get<{ rules: AssignmentRule[] }>("/automations/assignment-rules");
  return data.rules || [];
}

export async function createAssignmentRule(input: SaveAssignmentRuleInput) {
  await apiClient.post("/automations/assignment-rules", input);
}

export async function updateAssignmentRule(id: string, input: Partial<SaveAssignmentRuleInput> & { is_active?: boolean }) {
  await apiClient.put(`/automations/assignment-rules/${id}`, input);
}

export async function deleteAssignmentRule(id: string) {
  await apiClient.delete(`/automations/assignment-rules/${id}`);
}

export async function reorderAssignmentRules(ids: string[]) {
  await apiClient.put("/automations/assignment-rules/reorder", { ids });
}

export interface AutomationSequence {
  id: string;
  name: string;
}

// Follow-up sequences a rule can start for the leads it assigns.
export async function fetchSequences() {
  const { data } = await apiClient.get<{ sequences: AutomationSequence[] }>("/automations/sequences");
  return data.sequences || [];
}

export async function fetchTeams() {
  const { data } = await apiClient.get<{ teams: Team[] }>("/teams");
  return data.teams || [];
}

// ---- Messaging & developer config (Settings > Messaging / Developer) --------------------------

export interface InboundReplyRule {
  trigger: "keyword" | "outside_hours" | "first_message";
  keyword?: string;
  type: "text" | "template";
  value?: string;
  language?: string;
}

export interface CannedReply {
  name: string;
  text: string;
}

export interface FeatureConfig {
  integration_alert_hours: number;
  whatsapp_messaging_limit?: number | null;
  meta_capi_enabled: boolean;
  meta_qualified_event: string;
  meta_won_event: string;
  assignment_fallback_id?: string | null;
  inbound_reply_rules: InboundReplyRule[];
  canned_replies: CannedReply[];
  [key: string]: unknown;
}

export interface LogEntry {
  id: string;
  event?: string;
  event_name?: string;
  status: string;
  created_at: string;
  error?: string | null;
}

export interface Webhook {
  id: string;
  url: string;
  active: boolean;
}

export async function fetchFeatureConfig() {
  const { data } = await apiClient.get<{ config: FeatureConfig }>("/features/config");
  const config = data.config;
  return { ...config, inbound_reply_rules: config.inbound_reply_rules || [], canned_replies: config.canned_replies || [] };
}

// The server expects the whole config back, so callers pass the object they loaded, edited.
export async function saveFeatureConfig(config: FeatureConfig) {
  await apiClient.put("/features/config", config);
}

export async function fetchCapiEvents() {
  const { data } = await apiClient.get<{ events: LogEntry[] }>("/features/capi-events");
  return data.events || [];
}

export async function fetchWebhooks() {
  const { data } = await apiClient.get<{ webhooks: Webhook[] }>("/features/webhooks");
  return data.webhooks || [];
}

export async function createWebhook(url: string) {
  const { data } = await apiClient.post<{ webhook: { secret: string } }>("/features/webhooks", {
    url,
    events: ["lead.created", "lead.stage_changed", "lead.won"],
  });
  return data.webhook.secret;
}

export async function disableWebhook(id: string) {
  await apiClient.delete(`/features/webhooks/${id}`);
}

export async function fetchDeliveries() {
  const { data } = await apiClient.get<{ deliveries: LogEntry[] }>("/features/deliveries");
  return data.deliveries || [];
}
