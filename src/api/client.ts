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

apiClient.interceptors.request.use(async (config) => {
  const token = await getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
    if (error.response?.status === 401) {
      await clearStoredToken();
      // AuthContext listens for this and redirects to /login
    }
    return Promise.reject(error);
  }
);
