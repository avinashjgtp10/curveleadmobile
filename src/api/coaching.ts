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

interface PlaybookRow {
  best_practices?: string[] | null;
  common_objections?: { objection: string; recommended_response?: string; response?: string }[] | null;
  phrases_that_work?: string[] | null;
  generated_at?: string | null;
  created_at?: string | null;
}

interface ServerStaffStat {
  id: string;
  name: string;
  call_count?: number;
  avg_score?: number | null;
  score_vs_team?: number | null;
  conversion_rate?: number;
  top_missed?: string[];
}

// The server keeps the playbook (GET /playbook) and the per-person stats (GET /playbook/coaching) apart and names the
// fields differently from this screen, so both are fetched together and reshaped here.
function toPlaybook(row: PlaybookRow | null | undefined): CoachingPlaybook | null {
  if (!row) return null;
  return {
    best_practices: row.best_practices || [],
    objections: (row.common_objections || []).map((item) => ({ objection: item.objection, response: item.recommended_response || item.response || "" })),
    winning_phrases: row.phrases_that_work || [],
    generated_at: row.generated_at || row.created_at || "",
  };
}

export async function fetchCoaching(): Promise<CoachingData> {
  const [stats, playbook] = await Promise.all([
    apiClient.get<{ staff: ServerStaffStat[] }>("/playbook/coaching"),
    apiClient.get<{ playbook: PlaybookRow | null }>("/playbook").catch(() => null),
  ]);
  return {
    playbook: toPlaybook(playbook?.data.playbook),
    staff: (stats.data.staff || []).map((member) => ({
      id: member.id,
      name: member.name,
      calls: member.call_count ?? 0,
      avg_score: member.avg_score ?? null,
      vs_team: member.score_vs_team ?? null,
      conv_rate: member.conversion_rate ?? 0,
      top_missed_points: member.top_missed?.length ? member.top_missed.join(", ") : null,
    })),
  };
}

export async function regenerateCoaching() {
  // The AI writes the playbook before answering, which takes longer than the default 15 seconds.
  await apiClient.post("/playbook/generate", undefined, { timeout: 90000 });
  return fetchCoaching();
}
