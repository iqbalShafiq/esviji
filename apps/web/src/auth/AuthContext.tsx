import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import api, { getCurrentUser, loginUser, registerUser, setAuthToken } from "../lib/api.js";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: "user" | "admin";
  tokenBalance: number | null;
}

interface AuthContextValue {
  user?: AuthUser;
  token?: string;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: (options?: { silent?: boolean }) => Promise<void>;
}

const TOKEN_KEY = "esviji.authToken.v1";
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | undefined>(() => localStorage.getItem(TOKEN_KEY) ?? undefined);
  const [user, setUser] = useState<AuthUser | undefined>();
  const [isLoading, setIsLoading] = useState(Boolean(token));

  const persistToken = useCallback((nextToken?: string) => {
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken);
    else localStorage.removeItem(TOKEN_KEY);
    setAuthToken(nextToken);
    setToken(nextToken);
  }, []);

  const refreshUser = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setIsLoading(true);
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch {
      persistToken(undefined);
      setUser(undefined);
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }, [persistToken]);

  useEffect(() => {
    setAuthToken(token);
    if (!token) {
      setIsLoading(false);
      setUser(undefined);
      return;
    }
    void refreshUser();
  }, [token, refreshUser]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    token,
    isLoading,
    login: async (identifier, password) => {
      const result = await loginUser({ identifier, password });
      setUser(result.user);
      persistToken(result.token);
    },
    register: async (username, email, password) => {
      const result = await registerUser({ username, email, password });
      setUser(result.user);
      persistToken(result.token);
    },
    logout: () => {
      persistToken(undefined);
      setUser(undefined);
      void api.getUri();
    },
    refreshUser,
  }), [user, token, isLoading, persistToken, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
