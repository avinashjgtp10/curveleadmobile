import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import {
  apiClient,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
  isNetworkError,
} from "@/api/client";
import { AuthUser, Tenant } from "@/types";

// The last profile the server confirmed, so opening the app offline doesn't look like being signed out.
const SESSION_CACHE_KEY = "curvelead_cached_session";

interface AuthContextValue {
  user: AuthUser | null;
  tenant: Tenant | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-reads the signed-in user and workspace, e.g. after a plan payment. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getStoredToken();
      if (token) {
        try {
          const { data } = await apiClient.get<{ user: AuthUser; tenant: Tenant }>(
            "/auth/me"
          );
          setUser(data.user);
          setTenant(data.tenant);
          AsyncStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ user: data.user, tenant: data.tenant })).catch(() => {});
        } catch (error) {
          if (isNetworkError(error) || (axios.isAxiosError(error) && (error.response?.status ?? 0) >= 500)) {
            // No signal or the server is down: that doesn't mean the session ended. Stay signed in with the last known profile.
            try {
              const cached = await AsyncStorage.getItem(SESSION_CACHE_KEY);
              if (cached) {
                const session = JSON.parse(cached) as { user: AuthUser; tenant: Tenant };
                setUser(session.user);
                setTenant(session.tenant);
              }
            } catch { /* no usable cache: the login screen shows */ }
          } else {
            // The server answered and rejected the token (expired, revoked): a real sign-out.
            await clearStoredToken();
            AsyncStorage.removeItem(SESSION_CACHE_KEY).catch(() => {});
          }
        }
      }
      setIsLoading(false);
    })();
  }, []);

  async function login(email: string, password: string) {
    const { data } = await apiClient.post<{
      token: string;
      user: AuthUser;
      tenant: Tenant;
    }>("/auth/login", { email, password });
    await setStoredToken(data.token);
    setUser(data.user);
    setTenant(data.tenant);
    AsyncStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ user: data.user, tenant: data.tenant })).catch(() => {});
  }

  async function requestOtp(email: string) {
    await apiClient.post("/auth/request-otp", { email });
  }

  async function verifyOtp(email: string, otp: string) {
    const { data } = await apiClient.post<{
      token: string;
      user: AuthUser;
      tenant: Tenant;
    }>("/auth/verify-otp", { email, otp });
    await setStoredToken(data.token);
    setUser(data.user);
    setTenant(data.tenant);
    AsyncStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ user: data.user, tenant: data.tenant })).catch(() => {});
  }

  async function refreshProfile() {
    try {
      const { data } = await apiClient.get<{ user: AuthUser; tenant: Tenant }>("/auth/me");
      setUser(data.user);
      setTenant(data.tenant);
    } catch {
      // Keep what we have; the next launch will try again.
    }
  }

  async function logout() {
    await clearStoredToken();
    AsyncStorage.removeItem(SESSION_CACHE_KEY).catch(() => {});
    setUser(null);
    setTenant(null);
  }

  return (
    <AuthContext.Provider value={{ user, tenant, isLoading, login, requestOtp, verifyOtp, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
