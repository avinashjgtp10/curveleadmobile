import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { Platform } from "react-native";
import { registerPushToken } from "@/api/pushTokens";
import { registerForPushNotificationsAsync } from "./push";
import { withRetry } from "./retry";

export const LAST_REGISTERED_TOKEN_KEY = "curvelead_push_token";
const STATUS_KEY = "curvelead_push_status";
const PLATFORM = Platform.OS === "ios" ? "ios" : "android";

export type PushState = "registered" | "failed" | "denied" | "unsupported";
export interface PushStatus {
  state: PushState;
  detail?: string;
  at: string;
}

async function remember(state: PushState, detail?: string): Promise<PushStatus> {
  const status: PushStatus = { state, detail, at: new Date().toISOString() };
  await AsyncStorage.setItem(STATUS_KEY, JSON.stringify(status)).catch(() => {});
  return status;
}

export async function getPushStatus(): Promise<PushStatus | null> {
  try {
    const raw = await AsyncStorage.getItem(STATUS_KEY);
    return raw ? (JSON.parse(raw) as PushStatus) : null;
  } catch {
    return null;
  }
}

function describeError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const code = error.response?.status;
    if (code === 404) return "The server has no push-token endpoint yet (404). Ask the backend team to add POST /notifications/push-tokens.";
    if (code) return `The server rejected the push token (HTTP ${code}).`;
    return "Couldn't reach the server. Check your connection.";
  }
  return error instanceof Error ? error.message : "Unknown error.";
}

/**
 * Asks for permission, gets this phone's push token and registers it with the backend, then records
 * the outcome so the Notification Settings screen can show why pushes aren't arriving.
 * `force` re-sends the token even if the same one was already registered.
 */
export async function registerDevice(force = false): Promise<PushStatus> {
  let token: string;
  try {
    const result = await registerForPushNotificationsAsync();
    if (result.status === "denied") return remember("denied", "Notification permission is turned off for CurveLead.");
    if (result.status === "unsupported") return remember("unsupported", "Push needs the installed app on a real phone, not Expo Go or an emulator.");
    token = result.token;
  } catch (error) {
    console.warn("[push] could not get a push token", error);
    return remember("failed", error instanceof Error ? error.message : "Could not get a push token from Expo/Firebase.");
  }

  const lastToken = await AsyncStorage.getItem(LAST_REGISTERED_TOKEN_KEY);
  if (!force && lastToken === token) {
    const existing = await getPushStatus();
    if (existing?.state === "registered") return existing;
    return remember("registered");
  }

  let lastError: unknown;
  const ok = await withRetry(async () => {
    try {
      await registerPushToken(token, PLATFORM);
    } catch (error) {
      lastError = error;
      throw error;
    }
  });
  if (!ok) {
    // Not persisted, so the next app start or login tries again instead of giving up for good.
    console.warn("[push] backend rejected the push token", lastError);
    return remember("failed", describeError(lastError));
  }
  await AsyncStorage.setItem(LAST_REGISTERED_TOKEN_KEY, token);
  return remember("registered");
}
