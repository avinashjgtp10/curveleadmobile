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

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await clearStoredToken();
      // AuthContext listens for this and redirects to /login
    }
    return Promise.reject(error);
  }
);
