import React, { createContext, useContext, useEffect, useState } from "react";
import {
  apiClient,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
} from "@/api/client";
import { AuthUser } from "@/types";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getStoredToken();
      if (token) {
        try {
          const { data } = await apiClient.get<AuthUser>("/auth/me");
          setUser(data);
        } catch {
          await clearStoredToken();
        }
      }
      setIsLoading(false);
    })();
  }, []);

  async function login(email: string, password: string) {
    const { data } = await apiClient.post("/auth/login", { email, password });
    await setStoredToken(data.token);
    setUser(data.user);
  }

  async function logout() {
    await clearStoredToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
