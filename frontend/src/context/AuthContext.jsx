import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useToast } from "../hooks/use-toast";

const AuthContext = createContext(null);
const TOKEN_KEY = "regulens_token";

const USER_KEY = "regulens_user";

function getStoredToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function getStoredUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser);
  const [token, setToken] = useState(getStoredToken);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) throw new Error("Invalid token"); return r.json(); })
      .then((u) => { if (!cancelled) { setUser(u); sessionStorage.setItem(USER_KEY, JSON.stringify(u)); } })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        setUser(null);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, toast]);

  const login = useCallback(async (email, password) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(err.detail || "Login failed");
    }
    const data = await res.json();
    setToken(data.access_token);
    setUser(data.user);
    sessionStorage.setItem(TOKEN_KEY, data.access_token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }, []);

  const hasRole = useCallback((...roles) => {
    if (!user) return false;
    if (roles.length === 0) return true;
    return roles.includes(user.role);
  }, [user]);

  const value = { user, token, login, logout, loading, hasRole, isAuthenticated: !!token && !!user };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
