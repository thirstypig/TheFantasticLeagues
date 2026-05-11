/*
 * MobileShell — narrow-viewport overlay for the Aurora chrome.
 *
 * Mounted by `MobileLayoutGate` whenever `(max-width: 767px)` matches.
 * The desktop AuroraShell still wraps every authenticated route — this
 * shell renders *inside* it, so the page-level chrome (LeagueProvider,
 * theme, ambient bg) carries through unchanged.
 *
 * Routing strategy: read `useLocation()` and switch in a mobile twin
 * page when one exists; otherwise fall through to `children` so the
 * desktop component keeps rendering. This lets us ship pages
 * incrementally without breaking deep links.
 */
import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../auth/AuthProvider";
import { useTheme } from "../contexts/ThemeContext";
import type { LeagueListItem } from "../api";
import "../components/aurora/aurora.css";
import { MobileTabBar, type MobileRole } from "./MobileTabBar";
import { MobileHome } from "./pages/MobileHome";
import { MobilePlayers } from "./pages/MobilePlayers";
import { MobileStandings } from "./pages/MobileStandings";

/** Map a pathname to a mobile page (or `null` to fall through to desktop). */
function pickMobilePage(pathname: string): React.ReactElement | null {
  if (pathname === "/") {
    return <MobileHome />;
  }
  if (pathname === "/season" || pathname.startsWith("/season/")) {
    return <MobileStandings />;
  }
  if (pathname === "/players") {
    return <MobilePlayers />;
  }
  return null;
}

interface MobileShellProps {
  children: React.ReactNode;
}

export function MobileShell({ children }: MobileShellProps) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { leagueId, leagues } = useLeague();

  const role: MobileRole = useMemo(() => {
    if (user?.isAdmin) return "commish";
    const selected = (leagues ?? []).find((l: LeagueListItem) => l.id === leagueId);
    if (selected?.access?.type === "MEMBER" && selected?.access?.role === "COMMISSIONER") {
      return "commish";
    }
    return "manager";
  }, [user, leagues, leagueId]);

  const mobilePage = pickMobilePage(pathname);

  return (
    <div
      className={`aurora-theme ${theme === "dark" ? "dark" : ""}`}
      data-testid="mobile-shell"
      style={{ minHeight: "100vh", color: "var(--am-text)" }}
    >
      <div
        style={{
          minHeight: "100vh",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
          background: "var(--am-bg)",
          backgroundImage: "var(--am-glow-1), var(--am-glow-2), var(--am-glow-3)",
        }}
      >
        {mobilePage ?? children}
      </div>
      <MobileTabBar role={role} leagueId={leagueId} />
    </div>
  );
}
