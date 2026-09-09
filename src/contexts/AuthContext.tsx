import React, { createContext, useContext, useEffect, useState } from "react";
import {
  apiClient,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
} from "@/api/client";
import { AuthUser, Tenant } from "@/types";

interface AuthContextValue {
  user: AuthUser | null;
  tenant: Tenant | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
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
        } catch {
          await clearStoredToken();
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
  }

  async function logout() {
    await clearStoredToken();
    setUser(null);
    setTenant(null);
  }

  return (
    <AuthContext.Provider value={{ user, tenant, isLoading, login, requestOtp, verifyOtp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
