import { apiClient } from "./client";

export interface LeadStatus {
  id: string;
  stage_id: string | null;
  name: string;
  color?: string;
  pos: number;
  is_default?: boolean;
}

export interface LeadStage {
  id: string | null;
  name: string;
  color?: string;
  pos?: number;
  is_won?: boolean;
  is_lost?: boolean;
  meta_event_name?: string;
  is_default?: boolean;
  statuses: LeadStatus[];
}

export async function fetchStagesWithStatuses() {
  const { data } = await apiClient.get<{ stages: LeadStage[] }>("/lead-statuses/by-stage");
  return data.stages || [];
}

export interface SaveStageInput {
  name: string;
  color: string;
  is_won: boolean;
  is_lost: boolean;
  meta_event_name: string;
}

// Same fallback as the web: if statuses aren't available yet, still show the stages.
export async function fetchPipeline() {
  try {
    return await fetchStagesWithStatuses();
  } catch {
    const { data } = await apiClient.get<{ stages: LeadStage[] }>("/lead-stages");
    return (data.stages || []).map((stage) => ({ ...stage, statuses: [] }));
  }
}

export async function createStage(input: SaveStageInput) {
  await apiClient.post("/lead-stages", input);
}

export async function updateStage(id: string, input: SaveStageInput) {
  await apiClient.put(`/lead-stages/${id}`, input);
}

export async function deleteStage(id: string) {
  await apiClient.delete(`/lead-stages/${id}`);
}

export async function createStatus(input: { name: string; stage_id: string }) {
  await apiClient.post("/lead-statuses", input);
}

export async function updateStatus(id: string, input: { name: string }) {
  await apiClient.put(`/lead-statuses/${id}`, input);
}

export async function deleteStatus(id: string) {
  await apiClient.delete(`/lead-statuses/${id}`);
}
