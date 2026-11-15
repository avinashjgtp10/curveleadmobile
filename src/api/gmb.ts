import { apiClient } from "./client";

export interface GmbReviewRequestSettings {
  enabled: boolean;
  review_link: string;
  message: string;
  // Approved WhatsApp template used when the lead is outside the 24-hour reply window ("" = none).
  template_name?: string;
}

const DEFAULT_MESSAGE = "Hi {{name}}! Thank you for choosing us — it means a lot. If you enjoyed the experience, would you mind leaving us a quick Google review? {{review_link}}";

export async function fetchGmbReviewRequestSettings() {
  const { data } = await apiClient.get<Partial<GmbReviewRequestSettings>>("/gmb/settings");
  return { enabled: false, review_link: "", message: DEFAULT_MESSAGE, template_name: "", ...data };
}

export async function updateGmbReviewRequestSettings(input: GmbReviewRequestSettings) {
  await apiClient.put("/gmb/settings", input);
  return input;
}

export async function draftGmbReviewMessage() {
  const { data } = await apiClient.post<{ message: string }>("/gmb/draft-message");
  return data.message;
}

export interface GmbLocation {
  id: string;
  name: string;
  address?: string;
  details?: { address?: { lines?: string[]; locality?: string; region?: string; postal_code?: string } };
}

export function gmbAddressText(location: GmbLocation) {
  const a = location.details?.address;
  const text = a ? [...(a.lines || []), a.locality, a.region, a.postal_code].filter(Boolean).join(", ") : "";
  return text || location.address || "";
}

/** Whether Google Business Profile is connected, plus the account name when it is. */
export async function fetchGmbConnection() {
  const { data } = await apiClient.get<{ gmb_connected?: boolean; gmb_account_name?: string }>("/gmb/settings");
  return { connected: !!data.gmb_connected, accountName: data.gmb_account_name || "" };
}

/** The business locations Google returns for the connected account (read-only; same call the website uses). */
export async function fetchGmbLocations() {
  const { data } = await apiClient.get<{ ok?: boolean; locations?: GmbLocation[] }>("/gmb/profiles");
  if (data.ok === false) throw new Error("google_unavailable");
  return data.locations || [];
}

/** "Check again": re-reads the Google accounts/locations for this connection. */
export async function refreshGmb() {
  await apiClient.post("/gmb/refresh");
}
