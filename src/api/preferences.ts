import { apiClient } from "./client";

export interface UserPreferences {
  hidden_lead_stages?: string[];
  [key: string]: unknown;
}

export async function fetchPreferences() {
  const { data } = await apiClient.get<{ preferences: UserPreferences }>("/auth/preferences");
  return data.preferences;
}

export async function updatePreferences(patch: Partial<UserPreferences>) {
  const { data } = await apiClient.put<{ preferences: UserPreferences }>("/auth/preferences", patch);
  return data.preferences;
}
