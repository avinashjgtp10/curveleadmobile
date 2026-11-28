import axios from "axios";
import { Platform } from "react-native";
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

// expo-secure-store has no web implementation (its calls throw "getValueWithKeyAsync is not a function"),
// so the browser build keeps the token in localStorage instead. Phones keep using the secure store.
const isWeb = Platform.OS === "web";

function webStorage() {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

export async function setStoredToken(token: string) {
  memoryToken = token;
  recent.clear();
  if (isWeb) { webStorage()?.setItem(TOKEN_KEY, token); return; }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

// Reading the secure store on every request is slow; keep the token in memory once it's known.
let memoryToken: string | null | undefined;

export async function getStoredToken() {
  if (memoryToken !== undefined) return memoryToken;
  memoryToken = isWeb ? webStorage()?.getItem(TOKEN_KEY) ?? null : await SecureStore.getItemAsync(TOKEN_KEY);
  return memoryToken;
}

export async function clearStoredToken() {
  memoryToken = null;
  recent.clear();
  if (isWeb) { webStorage()?.removeItem(TOKEN_KEY); return; }
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
  if (__DEV__) (config as { _t?: number })._t = Date.now();
  return config;
});

// Development only: shows which calls are slow in the Metro console.
if (__DEV__) {
  apiClient.interceptors.response.use(
    (response) => { console.log(`[api] ${response.config.method?.toUpperCase()} ${response.config.url} ${Date.now() - ((response.config as { _t?: number })._t ?? Date.now())}ms`); return response; },
    (error) => { const c = error?.config as { _t?: number; method?: string; url?: string } | undefined; if (c) console.log(`[api] ${c.method?.toUpperCase()} ${c.url} failed after ${Date.now() - (c._t ?? Date.now())}ms`); return Promise.reject(error); }
  );
}

// Two screens asking for the same thing at the same moment (e.g. notifications, leads) share one request.
const inFlight = new Map<string, Promise<unknown>>();
const RECENT_TTL_MS = 15_000;
// Rarely-changing setup data (pipeline stages, team list, plans, notification groups) is reused for longer. Any edit made
// from this app (POST/PUT/DELETE) still clears the whole cache, so what the person just changed always shows at once.
const STABLE_TTL_MS = 2 * 60_000;
const STABLE = /^\/(lead-statuses|lead-stages|staff|payments\/plans|notifications\/groups)(\?|$|\/by-stage)/;
const recent = new Map<string, { at: number; response: unknown }>();
// Bumped on every save; a read only gets cached if no save happened while it was in flight.
let epoch = 0;
// Live data that is polled or must always be current is never served from the cache.
const UNCACHED = /\/(whatsapp|notifications|auth)(\/|\?|$)/;
const rawGet = apiClient.get.bind(apiClient) as (url: string, config?: object) => Promise<unknown>;
(apiClient as unknown as { get: typeof rawGet }).get = (url, passedConfig) => {
  // `fresh: true` (pull to refresh) skips the saved answers and the shared in-flight request, so the person really gets the server's current data.
  const { fresh, ...config } = (passedConfig ?? {}) as { fresh?: boolean; params?: unknown };
  const key = `${url}|${JSON.stringify(config.params ?? {})}`;
  const existing = fresh ? undefined : inFlight.get(key);
  if (existing) return existing;
  // A response from the last few seconds is reused, so going back to a page shows its data at once instead of waiting on the server.
  const hit = fresh ? undefined : recent.get(key);
  const stable = STABLE.test(url);
  if (hit && Date.now() - hit.at < (stable ? STABLE_TTL_MS : RECENT_TTL_MS)) return Promise.resolve(hit.response);
  const startEpoch = epoch;
  const request = rawGet(url, config)
    .then((response) => {
      // A save that happened while this was in flight makes the answer possibly stale: use it, but don't keep it.
      if (startEpoch === epoch && (stable || !UNCACHED.test(url))) recent.set(key, { at: Date.now(), response });
      return response;
    })
    .finally(() => { if (inFlight.get(key) === request) inFlight.delete(key); });
  inFlight.set(key, request);
  return request;
};

// Anything that changes data throws the cache away, so a screen never shows what it just edited as it was before.
// This happens when the save starts AND when it finishes: a read that began before the save finished (and so joined an
// older in-flight request, or was cached after the first clear) would otherwise hand back the old values for ~15 seconds.
function forgetReads() { epoch++; recent.clear(); inFlight.clear(); }
apiClient.interceptors.request.use((config) => {
  if ((config.method || "get").toLowerCase() !== "get") forgetReads();
  return config;
});
apiClient.interceptors.response.use(
  (response) => { if ((response.config.method || "get").toLowerCase() !== "get") forgetReads(); return response; },
  (error) => { if (((error?.config?.method as string | undefined) || "get").toLowerCase() !== "get") forgetReads(); return Promise.reject(error); },
);

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
    // A login/OTP lockout is about that person's sign-in attempts, not the app's read traffic, so it must not hold back reads after they get in.
    const isAuthCall = String(error.config?.url ?? "").includes("/auth/");
    if (error.response?.status === 429 && !error.response.data?.rate_limited && !isAuthCall) {
      blockedUntil = Date.now() + blockedForMs(error.response.headers);
    }
    // Some endpoints relay a third party's 401 (e.g. Google rejecting a stale Business Profile token). That says nothing
    // about this person's CurveLead session, so it must not sign them out.
    const thirdPartyAuth = /\/gmb\/(profiles|refresh|insights)/.test(String(error.config?.url ?? ""));
    if (error.response?.status === 401 && !thirdPartyAuth) {
      await clearStoredToken();
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  }
);
