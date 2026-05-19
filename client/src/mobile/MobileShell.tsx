/*
 * MobileShell — Score Sheet narrow-viewport chrome.
 *
 * Mounted by `MobileLayoutGate` whenever `(max-width: 767px)` matches.
 *
 * Chrome:
 *   - 50px fixed top app bar: hamburger (left) → title (center) → theme toggle (right)
 *   - Left-slide drawer (260px, always in DOM, slides with transform) + dark overlay
 *   - MobileTabBar rendered inside the drawer as a vertical nav list; all
 *     data-testid / data-tab-key / aria-current attributes are preserved so
 *     existing tests pass without modification
 *   - No bottom dock
 */
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useLeague } from "../contexts/LeagueContext";
import { useTheme } from "../contexts/ThemeContext";
import "../components/aurora/aurora.css";
import { MobileTabBar } from "./MobileTabBar";
import { MobileHome } from "./pages/MobileHome";
import { MobileMore } from "./pages/MobileMore";
import { MobilePlayers } from "./pages/MobilePlayers";
import { MobileStandings } from "./pages/MobileStandings";
import { MobileTeam } from "./pages/MobileTeam";
import { MobileWireList } from "./pages/MobileWireList";

/** Map a pathname to a mobile page (or `null` to fall through to desktop). */
function pickMobilePage(pathname: string): React.ReactElement | null {
  if (pathname === "/") return <MobileHome />;
  if (pathname === "/season" || pathname.startsWith("/season/")) return <MobileStandings />;
  if (pathname === "/players") return <MobilePlayers />;
  if (pathname === "/more") return <MobileMore />;
  const teamMatch = pathname.match(/^\/teams\/([^/]+)\/?$/);
  if (teamMatch) return <MobileTeam teamCode={teamMatch[1]} />;
  const wireListMatch = pathname.match(/^\/teams\/([^/]+)\/wire-list\/?$/);
  if (wireListMatch) return <MobileWireList teamCode={wireListMatch[1]} />;
  return null;
}

interface MobileShellProps {
  children: React.ReactNode;
}

export function MobileShell({ children }: MobileShellProps) {
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { myTeamCode, leagues, leagueId } = useLeague();

  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const currentLeague = (leagues ?? []).find((l) => l.id === leagueId);
  const leagueName = currentLeague?.name ?? "The Fantastic Leagues";
  const mobilePage = pickMobilePage(pathname);

  return (
    <div
      className={`aurora-theme ${theme === "dark" ? "dark" : ""}`}
      data-testid="mobile-shell"
      style={{ minHeight: "100vh", color: "var(--am-text)", background: "var(--am-bg)" }}
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
        <button
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            flexShrink: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--am-text-muted)",
            padding: 0,
          }}
        >
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div style={{ flex: 1, textAlign: "center", minWidth: 0, overflow: "hidden" }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--am-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {leagueName}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            flexShrink: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            color: "var(--am-text-muted)",
            padding: 0,
          }}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </header>

      {/* ── Dark overlay (only visible when drawer is open) ── */}
      <div
        aria-hidden
        onClick={() => setDrawerOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 40,
          opacity: drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? "auto" : "none",
          transition: "opacity 0.2s ease",
        }}
      />

      {/* ── Drawer panel — always in DOM so data-testid="mobile-tab-bar" is findable ── */}
      <div
        role="dialog"
        aria-label="Navigation menu"
        aria-modal={drawerOpen}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: 260,
          zIndex: 50,
          background: "var(--am-surface)",
          borderRight: "1px solid var(--am-border-strong)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          transform: drawerOpen ? "translateX(0)" : "translateX(-260px)",
          transition: "transform 0.25s ease",
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            padding: "16px 16px 14px",
            borderBottom: "1px solid var(--am-border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              background: "var(--am-accent)",
              display: "grid",
              placeItems: "center",
              fontSize: 15,
              fontWeight: 700,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            F
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--am-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {leagueName}
          </div>
        </div>

        {/* MobileTabBar — all data-testid / data-tab-key / aria-current preserved */}
        <div style={{ flex: 1 }}>
          <MobileTabBar myTeamCode={myTeamCode} />
        </div>

        {/* User footer */}
        <div
          style={{
            padding: 16,
            borderTop: "1px solid var(--am-border)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={toggleTheme}
            style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 4,
              fontSize: 13,
              color: "var(--am-text-muted)",
              background: "transparent",
              border: "1px solid transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              width: "100%",
            }}
          >
            {theme === "dark" ? "Light theme" : "Dark theme"}
          </button>
        </div>
      </div>

      {/* ── Page content ── */}
      <div
        style={{
          minHeight: "100vh",
          paddingTop: 50,
          paddingBottom: 16,
          background: "var(--am-bg)",
        }}
      >
        {mobilePage ?? children}
      </div>
    </div>
  );
}
