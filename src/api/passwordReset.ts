import { apiClient } from "./client";

// Sends a reset link to the email if an account exists. The server answers the same either way.
export async function requestPasswordReset(email: string) {
  await apiClient.post("/auth/forgot-password", { email });
}

export async function resetPassword(token: string, password: string) {
  await apiClient.post("/auth/reset-password", { token, password });
}

// People may paste the whole link from their email or just the code; accept both.
export function extractResetToken(input: string) {
  const value = input.trim();
  const match = value.match(/[?&]token=([^&#\s]+)/i);
  return match ? decodeURIComponent(match[1]) : value;
}
