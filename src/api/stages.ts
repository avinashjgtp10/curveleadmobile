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
  statuses: LeadStatus[];
}

export async function fetchStagesWithStatuses() {
  const { data } = await apiClient.get<{ stages: LeadStage[] }>("/lead-statuses/by-stage");
  return data.stages || [];
}
