import axios from "axios";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const { apiUrlDev, apiUrlProd } = Constants.expoConfig?.extra ?? {};

// __DEV__ is a global Expo/React Native provides automatically
export const API_BASE_URL = __DEV__ ? apiUrlDev : apiUrlProd;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

const TOKEN_KEY = "curvelead_auth_token";

export async function setStoredToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getStoredToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearStoredToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

let unauthorizedHandler: (() => void) | null = null;

/** AuthContext registers here so a rejected token (401) signs the user out and sends them to the login screen. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export const RATE_LIMIT_MESSAGE = "Too many requests. Please wait a minute and try again.";

// The server allows a fixed number of requests per window and then answers 429. While we know we're blocked,
// background reads (polling, refreshes) are held back instead of sent: every refused request only prolongs the wait.
// Taps that save something (POST/PUT/DELETE) still go through so the person can act as soon as the window reopens.
let blockedUntil = 0;

function blockedForMs(headers: Record<string, unknown> | undefined) {
  const retryAfter = Number(headers?.["retry-after"]);
  const resetAt = Number(headers?.["x-ratelimit-reset"]);
  let wait = 60_000;
  if (Number.isFinite(retryAfter) && retryAfter > 0) wait = retryAfter * 1000;
  else if (Number.isFinite(resetAt) && resetAt > 0) wait = resetAt * 1000 - Date.now();
  return Math.min(Math.max(wait, 5_000), 5 * 60_000);
}

/** How long background reads are being held back after the server said "Too many requests" (0 when not blocked). */
export function rateLimitRemainingMs() {
  return Math.max(0, blockedUntil - Date.now());
}

apiClient.interceptors.request.use(async (config) => {
  if (Date.now() < blockedUntil && (config.method || "get").toLowerCase() === "get") {
    throw new axios.AxiosError(RATE_LIMIT_MESSAGE, "ERR_BAD_REQUEST", config, undefined, {
      status: 429, statusText: "Too Many Requests", headers: {}, config,
      data: { error: RATE_LIMIT_MESSAGE, rate_limited: true },
    } as never);
  }
  const token = await getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Two screens asking for the same thing at the same moment (e.g. notifications, leads) share one request.
const inFlight = new Map<string, Promise<unknown>>();
const rawGet = apiClient.get.bind(apiClient) as (url: string, config?: object) => Promise<unknown>;
(apiClient as unknown as { get: typeof rawGet }).get = (url, config) => {
  const key = `${url}|${JSON.stringify((config as { params?: unknown } | undefined)?.params ?? {})}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const request = rawGet(url, config).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
};

export const OFFLINE_MESSAGE = "No internet connection. Check your network and try again.";
export const TIMEOUT_MESSAGE = "The server took too long to respond. Please try again.";

/** True when the request never got an answer from the server (no connection, timeout, server unreachable). */
export function isNetworkError(error: unknown) {
  return axios.isAxiosError(error) && (error.response?.status === 0 || (!error.response && !axios.isCancel(error)));
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // A request with no answer has no `response`, so every screen fell back to its generic "Could not load…".
    // Giving it a response with a clear `error` text lets all the existing error handling show the real reason.
    if (axios.isAxiosError(error) && !error.response && !axios.isCancel(error)) {
      const timedOut = error.code === "ECONNABORTED" || error.code === "ETIMEDOUT";
      error.response = {
        status: 0, statusText: "", headers: {}, config: error.config as never,
        data: { error: timedOut ? TIMEOUT_MESSAGE : OFFLINE_MESSAGE, network: true },
      };
    }
    if (error.response?.status === 429 && !error.response.data?.rate_limited) {
      blockedUntil = Date.now() + blockedForMs(error.response.headers);
    }
    if (error.response?.status === 401) {
      await clearStoredToken();
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  }
);
