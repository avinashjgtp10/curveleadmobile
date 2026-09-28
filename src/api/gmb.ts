import { apiClient } from "./client";

export interface GmbReviewRequestSettings {
  enabled: boolean;
  review_link: string;
  message: string;
}

const DEFAULT_MESSAGE = "Hi {{name}}! Thank you for choosing us — it means a lot. If you enjoyed the experience, would you mind leaving us a quick Google review? {{review_link}}";

export async function fetchGmbReviewRequestSettings() {
  const { data } = await apiClient.get<Partial<GmbReviewRequestSettings>>("/gmb/review-requests");
  return { enabled: false, review_link: "", message: DEFAULT_MESSAGE, ...data };
}

export async function updateGmbReviewRequestSettings(input: GmbReviewRequestSettings) {
  const { data } = await apiClient.put<GmbReviewRequestSettings>("/gmb/review-requests", input);
  return data;
}

export async function draftGmbReviewMessage() {
  const { data } = await apiClient.post<{ message: string }>("/gmb/review-requests/draft");
  return data.message;
}
