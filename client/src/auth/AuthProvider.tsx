// client/src/auth/AuthProvider.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE, fetchJsonApi } from "../api/base";
import { supabase } from "../lib/supabase";
import { Session } from "@supabase/supabase-js";

type User = {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  isAdmin: boolean;
  memberships: Array<{
    leagueId: string;
    role: "COMMISSIONER" | "OWNER" | "VIEWER";
    league?: {
      id: string;
      name: string;
      publicSlug: string;
      isPublic: boolean;
      seasonYear?: number | null;
    };
  }>;
};

type MeResponse = {
  user: User | null;
};

type AuthCtx = {
  me: MeResponse;
  user: User | null;
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<void>;

  loginWithGoogle: () => Promise<void>;
  loginWithYahoo: () => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<void>;

  // Backwards compatibility shim
  loginWithGoogleCredential: (_credential: string) => Promise<void>;

  logout: () => Promise<void>;
  isAdmin: boolean;
  isCommissioner: (leagueId: string) => boolean;
  isOwner: (leagueId: string) => boolean;
};

const Ctx = createContext<AuthCtx | null>(null);

async function fetchMe(): Promise<MeResponse> {
  const data = await fetchJsonApi<{ user: User | null }>(`${API_BASE}/auth/me`);
  return { user: data?.user ?? null };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<MeResponse>({ user: null });
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      if (!session) {
        setMe({ user: null });
        return;
      }
      const data = await fetchMe();
      setMe(data);
    } catch (e) {
      console.error("Failed to refresh user profile", e);
    }
  }

  useEffect(() => {
    let lastAccessToken: string | undefined;
    let fetchInFlight = false;

    async function syncUser(newSession: Session | null) {
      // Skip if the access token hasn't actually changed (dedup rapid auth events)
      const newToken = newSession?.access_token ?? null;
      if (lastAccessToken !== undefined && newToken === lastAccessToken) return;
      lastAccessToken = newToken;

      setSession(newSession);

      if (!newSession) {
        setMe({ user: null });
        setLoading(false);
        return;
      }

      // Avoid overlapping fetches from rapid auth events
      if (fetchInFlight) return;
      fetchInFlight = true;
      setLoading(true);
      try {
        const data = await fetchMe();
        setMe(data);
      } catch (e) {
        console.error("Failed to fetch user profile", e);
      } finally {
        fetchInFlight = false;
        setLoading(false);
      }
    }

    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncUser(session);
    });

    // 2. Listen for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncUser(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loginWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
  }

  async function loginWithYahoo() {
     await supabase.auth.signInWithOAuth({
      provider: "yahoo" as any,
      options: {
        redirectTo: window.location.origin,
      },
    });
  }
  
  async function loginWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function loginWithGoogleCredential(_c: string) {
      await loginWithGoogle();
  }

  async function logout() {
    await supabase.auth.signOut();
    // State update handled by onAuthStateChange
  }

  const isAdmin = Boolean(me.user?.isAdmin);

  const api = useMemo<AuthCtx>(
    () => ({
      me,
      user: me.user,
      session,
      loading,
      refresh,
      loginWithGoogle,
      loginWithYahoo,
      loginWithPassword,
      loginWithGoogleCredential,
      logout,
      isAdmin,
      isCommissioner: (leagueId: string) =>
        isAdmin || (me.user?.memberships || []).some((m) => String(m.leagueId) === String(leagueId) && m.role === "COMMISSIONER"),
      isOwner: (leagueId: string) =>
        isAdmin ||
        (me.user?.memberships || []).some((m) => String(m.leagueId) === String(leagueId) && (m.role === "OWNER" || m.role === "COMMISSIONER")),
    }),
    [me, session, loading, isAdmin]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
