import { apiClient } from "./client";

// Sends a reset link to the email if an account exists. The server answers the same either way.
export async function requestPasswordReset(email: string) {
  await apiClient.post("/auth/forgot-password", { email });
}

export async function resetPassword(token: string, password: string) {
  await apiClient.post("/auth/reset-password", { token, password });
}

// Changes the signed-in person's own password. The server checks the current one and answers with an `error` if it's wrong.
export async function changePassword(currentPassword: string, newPassword: string) {
  await apiClient.post("/auth/change-password", { currentPassword, newPassword });
}

// People may paste the whole link from their email or just the code; accept both.
export function extractResetToken(input: string) {
  const value = input.trim();
  const match = value.match(/[?&]token=([^&#\s]+)/i);
  if (!match) return value;
  // Runs on every keystroke while pasting; a stray "%" must not throw and crash the screen.
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
