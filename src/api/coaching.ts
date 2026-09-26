import { apiClient } from "./client";

export interface CoachingObjection {
  objection: string;
  response: string;
}

export interface CoachingPlaybook {
  best_practices: string[];
  objections: CoachingObjection[];
  winning_phrases: string[];
  generated_at: string;
}

export interface StaffCoachingStat {
  id: string;
  name: string;
  calls: number;
  avg_score: number | null;
  vs_team: number | null;
  conv_rate: number;
  top_missed_points: string | null;
}

export interface CoachingData {
  playbook: CoachingPlaybook | null;
  staff: StaffCoachingStat[];
}

export async function fetchCoaching() {
  const { data } = await apiClient.get<CoachingData>("/coaching");
  return data;
}

export async function regenerateCoaching() {
  const { data } = await apiClient.post<CoachingData>("/coaching/regenerate");
  return data;
}
