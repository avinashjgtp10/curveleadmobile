import { apiClient } from "./client";

export interface UserPreferences {
  hidden_lead_stages?: string[];
  language?: string;
  // Languages the person asked to be told about once they are translated.
  language_requests?: string[];
  // Per-type notification switches; a key set to false is off, anything else is on.
  notification_prefs?: Record<string, boolean>;
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
