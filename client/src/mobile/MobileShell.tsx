/*
 * MobileShell — Score Sheet narrow-viewport chrome.
 *
 * Mounted by `MobileLayoutGate` whenever `(max-width: 767px)` matches.
 *
 * Chrome:
 *   - 50px fixed top app bar: page title (center) + avatar button (right) that
 *     opens the account bottom sheet (theme lives in Profile -> Appearance)
 *   - Fixed bottom MobileTabBar: Today, My Team, Players, League
 *   - No drawer
 */
import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useLeague } from "../contexts/LeagueContext";
import { useTheme } from "../contexts/ThemeContext";
import "../components/aurora/aurora.css";
import { activeTabFor, buildPrimaryTabs } from "../lib/navModel";
import { AccountSheet } from "./AccountSheet";
import { Glyph } from "./atoms/Glyph";
import { MobileTabBar } from "./MobileTabBar";
import TodayPage from "../pages/today/TodayPage";
import { MobilePlayers } from "./pages/MobilePlayers";
import { MobileStandings } from "./pages/MobileStandings";
import { MobileTeam } from "./pages/MobileTeam";
import { MobileWireList } from "./pages/MobileWireList";

/** Map a pathname to a mobile page (or `null` to fall through to desktop). */
function pickMobilePage(pathname: string): React.ReactElement | null {
  if (pathname === "/") return <TodayPage />;
  if (pathname === "/season" || pathname.startsWith("/season/")) return <MobileStandings />;
  if (pathname === "/players") return <MobilePlayers />;
  const teamMatch = pathname.match(/^\/teams\/([^/]+)\/?$/);
  if (teamMatch) return <MobileTeam teamCode={teamMatch[1]} />;
  const wireListMatch = pathname.match(/^\/teams\/([^/]+)\/wire-list\/?$/);
  if (wireListMatch) return <MobileWireList teamCode={wireListMatch[1]} />;
  return null;
}

const SHELL_TOP_INSET = "50px";
const SHELL_BOTTOM_INSET = "calc(64px + env(safe-area-inset-bottom))";

interface MobileShellProps {
  children: React.ReactNode;
}

export function MobileShell({ children }: MobileShellProps) {
  const { pathname } = useLocation();
  const { theme } = useTheme();
  const { myTeamCode, leagues, leagueId } = useLeague();

  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
  const closeAccount = useCallback(() => setAccountOpen(false), []);

  // Toasts render in a provider ABOVE the shell, so they cannot inherit the
  // root's custom properties; publish the insets on <html> too.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--shell-top-inset", SHELL_TOP_INSET);
    root.setProperty("--shell-bottom-inset", SHELL_BOTTOM_INSET);
    return () => {
      root.removeProperty("--shell-top-inset");
      root.removeProperty("--shell-bottom-inset");
    };
  }, []);

  async function onSignOut() {
    setAccountOpen(false);
    await logout();
    nav("/", { replace: true });
  }

  const currentLeague = (leagues ?? []).find((l) => l.id === leagueId);
  const leagueName = currentLeague?.name ?? "The Fantastic Leagues";
  const mobilePage = pickMobilePage(pathname);
  const activeKey = activeTabFor(pathname, myTeamCode);
  const pageTitle =
    buildPrimaryTabs({ myTeamCode }).find((t) => t.key === activeKey)?.label ?? leagueName;

  return (
    <div
      className={`aurora-theme ${theme === "dark" ? "dark" : ""}`}
      data-testid="mobile-shell"
      style={{
        minHeight: "100vh",
        color: "var(--am-text)",
        background: "var(--am-bg)",
        // Space the shell reserves; pages with fixed/full-height UI subtract it.
        ["--shell-top-inset" as string]: SHELL_TOP_INSET,
        ["--shell-bottom-inset" as string]: SHELL_BOTTOM_INSET,
      }}
    >
      {/* ── Fixed 50px top app bar ── */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 50,
          zIndex: 30,
          background: "var(--am-surface)",
          borderBottom: "1px solid var(--am-border-strong)",
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          gap: 8,
        }}
      >
        {/* Spacer mirrors the avatar so the title stays centered. */}
        <div aria-hidden style={{ width: 44, height: 44, flexShrink: 0 }} />

        <div style={{ flex: 1, textAlign: "center", minWidth: 0, overflow: "hidden" }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--am-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {pageTitle}
          </div>
        </div>

        <button
          type="button"
          aria-label="Account"
          aria-haspopup="dialog"
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            flexShrink: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--am-text-muted)",
            padding: 0,
          }}
        >
          <Glyph kind="me" size={24} />
        </button>
      </header>

      {accountOpen && (
        <AccountSheet isAdmin={Boolean(user?.isAdmin)} onClose={closeAccount} onSignOut={onSignOut} />
      )}

      <MobileTabBar myTeamCode={myTeamCode} />

      {/* ── Page content ── */}
      <div
        data-testid="mobile-content"
        style={{
          minHeight: "100vh",
          paddingTop: 50,
          paddingBottom: "calc(64px + env(safe-area-inset-bottom))",
          background: "var(--am-bg)",
        }}
      >
        {mobilePage ?? children}
      </div>
    </div>
  );
}
