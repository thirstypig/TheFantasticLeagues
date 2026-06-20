/*
 * AuroraShell — Score Sheet chrome for the authenticated desktop layout.
 *
 * Replaces the Aurora floating-dock + ambient-bg pattern with:
 *   - 56px sticky top bar: green logo block → text-tab nav → right chips
 *   - No bottom dock
 *   - Account popover anchored below the top bar
 *   - More popover anchored below the "More" tab
 *
 * All navigation items, route config, commissioner gating, league
 * switching, and theme toggle are preserved exactly as they were.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";

import type { LeagueListItem } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useTheme } from "../../contexts/ThemeContext";
import { useLeague } from "../../contexts/LeagueContext";
import { useSeasonGating } from "../../hooks/useSeasonGating";
import { Glass, SectionLabel } from "./atoms";
import "./aurora.css";

interface MoreItem {
  to: string;
  label: string;
  show?: boolean;
}

interface MoreSection {
  title: string;
  items: MoreItem[];
}

export default function AuroraShell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { leagueId, setLeagueId, leagues, draftMode, myTeamCode, currentSeason } = useLeague();
  const gating = useSeasonGating();

  // Detect current sport from URL path
  const currentSport = useMemo(() => {
    if (location.pathname.startsWith("/nba")) return "NBA";
    if (location.pathname.startsWith("/nfl")) return "NFL";
    return "MLB";
  }, [location.pathname]);

  // Sport accent class for root div
  const sportClass = currentSport === "NBA" ? "sport-nba" : currentSport === "NFL" ? "sport-nfl" : "";

  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
      if (accountOpen && accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [moreOpen, accountOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMoreOpen(false);
        setAccountOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const canAccessCommissioner = useMemo(() => {
    if (Boolean(user?.isAdmin)) return true;
    const selected = (leagues ?? []).find((l: LeagueListItem) => l.id === leagueId);
    return selected?.access?.type === "MEMBER" && selected?.access?.role === "COMMISSIONER";
  }, [leagues, user, leagueId]);

  // Sport nav tabs
  const sportTabs = useMemo(() => [
    { key: "MLB", label: "MLB", to: "/season" },
    { key: "NFL", label: "NFL", to: "/nfl" },
    { key: "NBA", label: "NBA", to: "/nba" },
  ], []);

  // Primary nav tabs — same items as the old dock
  const navTabs = useMemo(() => {
    const items: { key: string; label: string; to: string }[] = [
      { key: "Home", label: "Home", to: "/" },
    ];
    if (gating.isH2H) items.push({ key: "Matchup", label: "Matchup", to: "/matchup" });
    if (myTeamCode) items.push({ key: "MyTeam", label: "My Team", to: "/my-team" });
    items.push({ key: "Standings", label: "Standings", to: "/season" });
    items.push({ key: "Players", label: "Players", to: "/players" });
    items.push({ key: "AI", label: "AI", to: "/ai" });
    return items;
  }, [gating.isH2H, myTeamCode]);

  const moreSections: MoreSection[] = useMemo(() => [
    {
      title: "Explore",
      items: [
        { to: "/board", label: "Board" },
        { to: "/activity", label: "Activity" },
        { to: "/teams", label: "Teams" },
        { to: "/archive", label: "Archive" },
      ],
    },
    {
      title: "Insights",
      items: [
        { to: "/weekly-report", label: "Weekly Report" },
        { to: "/draft-report", label: "Draft Report" },
      ],
    },
    {
      title: "Draft",
      items: [
        { to: "/auction", label: "Auction", show: draftMode === "AUCTION" },
        { to: "/auction-results", label: "Auction Results", show: draftMode === "AUCTION" },
        { to: "/auction-values", label: "Auction Values", show: draftMode === "AUCTION" },
        { to: "/draft", label: "Snake Draft", show: draftMode === "DRAFT" },
        ...(leagueId ? [{ to: `/leagues/${leagueId}/keepers`, label: "Keepers" }] : []),
      ],
    },
    {
      title: "League",
      items: [
        { to: `/commissioner/${leagueId ?? ""}`, label: "Commissioner", show: canAccessCommissioner && Boolean(leagueId) },
        { to: "/rules", label: "Rules" },
        { to: "/payouts", label: "Payouts" },
        { to: "/guide", label: "Help & Guide" },
        { to: "/about", label: "About" },
      ],
    },
    ...(user?.isAdmin ? [{
      title: "Admin",
      items: [
        { to: "/admin", label: "Dashboard" },
        { to: "/admin/users", label: "Users" },
        { to: "/analytics", label: "Analytics" },
        { to: "/status", label: "Status" },
        { to: "/todo", label: "Todo" },
        { to: "/roadmap", label: "Roadmap" },
        { to: "/concepts", label: "Concepts" },
        { to: "/community", label: "Community" },
        { to: "/changelog", label: "Changelog" },
        { to: "/docs", label: "Docs" },
        { to: "/tech", label: "Under the Hood" },
      ],
    }] : []),
  ], [draftMode, leagueId, canAccessCommissioner, user?.isAdmin]);

  const currentLeague = leagues?.find((l: LeagueListItem) => l.id === leagueId);
  const leagueName = currentLeague?.name ?? "The Fantastic Leagues";

  async function handleLogout() {
    setAccountOpen(false);
    await logout();
    nav("/", { replace: true });
  }

  function handleNav(to: string) {
    setMoreOpen(false);
    nav(to);
  }

  // User chip label: first 8 chars of email localpart
  const userLabel = user?.email?.split("@")[0]?.slice(0, 10) ?? "Account";

  return (
    <div
      className={`aurora-theme ${sportClass} ${theme === "dark" ? "dark" : ""}`}
      style={{ minHeight: "100svh", background: "var(--am-bg)" }}
    >
      {/* ── Sticky top nav bar ── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          height: 56,
          background: "var(--am-surface)",
          borderBottom: "1px solid var(--am-border-strong)",
          display: "flex",
          alignItems: "stretch",
          padding: "0 18px",
          gap: 0,
        }}
      >
        {/* Logo block */}
        <button
          type="button"
          onClick={() => nav("/")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "0 20px 0 0",
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
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--am-text)",
              whiteSpace: "nowrap",
              letterSpacing: -0.1,
            }}
          >
            The Fantastic Leagues
          </span>
        </button>

        {/* Separator */}
        <div
          aria-hidden
          style={{ width: 1, background: "var(--am-border)", margin: "10px 0", flexShrink: 0 }}
        />

        {/* Sport nav tabs */}
        <nav
          aria-label="Sport navigation"
          style={{ display: "flex", alignItems: "stretch", gap: 0, flexShrink: 0 }}
        >
          {sportTabs.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.key === "MLB"}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                fontSize: 12,
                fontWeight: 600,
                color: isActive ? "var(--am-text)" : "var(--am-text-muted)",
                borderBottom: isActive
                  ? "2px solid var(--am-accent)"
                  : "2px solid transparent",
                textDecoration: "none",
                whiteSpace: "nowrap",
                transition: "color 0.15s, border-color 0.15s",
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Separator */}
        <div
          aria-hidden
          style={{ width: 1, background: "var(--am-border)", margin: "10px 0", flexShrink: 0 }}
        />

        {/* Primary text-tab nav */}
        <nav
          aria-label="Main navigation"
          style={{ display: "flex", alignItems: "stretch", flex: 1, overflow: "hidden" }}
        >
          {navTabs.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.to === "/"}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                padding: "0 16px",
                fontSize: 13,
                fontWeight: 600,
                color: isActive ? "var(--am-text)" : "var(--am-text-muted)",
                borderBottom: isActive
                  ? "2px solid var(--am-accent)"
                  : "2px solid transparent",
                textDecoration: "none",
                whiteSpace: "nowrap",
                transition: "color 0.15s, border-color 0.15s",
              })}
            >
              {item.label}
            </NavLink>
          ))}

          {/* More overflow tab */}
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 16px",
              fontSize: 13,
              fontWeight: 600,
              color: moreOpen ? "var(--am-text)" : "var(--am-text-muted)",
              borderBottom: moreOpen
                ? "2px solid var(--am-accent)"
                : "2px solid transparent",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontFamily: "inherit",
            }}
          >
            More
          </button>
        </nav>

        {/* Right side: season label + user chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {currentSeason && (
            <span
              style={{
                padding: "4px 10px",
                background: "var(--am-chip)",
                border: "1px solid var(--am-border)",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 500,
                color: "var(--am-text-muted)",
                whiteSpace: "nowrap",
              }}
            >
              {currentSeason}
            </span>
          )}

          <div ref={accountRef} style={{ position: "relative" }}>
            <button
              type="button"
              aria-label="Account menu"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((v) => !v)}
              style={{
                padding: "4px 10px",
                background: "var(--am-chip)",
                border: "1px solid var(--am-border)",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--am-text-muted)",
                fontFamily: "inherit",
                maxWidth: 120,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {userLabel}
            </button>
          </div>
        </div>
      </header>

      {/* Account popover */}
      {accountOpen && (
        <div
          style={{
            position: "fixed",
            top: 64,
            right: 18,
            zIndex: 50,
            width: 280,
          }}
        >
          <Glass strong>
            <SectionLabel>Account</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div
                aria-hidden
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 4,
                  background: "var(--am-chip)",
                  border: "1px solid var(--am-border-strong)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--am-accent)",
                }}
              >
                {(user?.email ?? "?")[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user?.email ?? "Signed in"}
                </div>
                {user?.isAdmin && (
                  <div style={{ fontSize: 11, color: "var(--am-text-muted)", marginTop: 2 }}>Admin</div>
                )}
              </div>
            </div>

            {leagues && leagues.length > 1 && (
              <>
                <SectionLabel>Switch League</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                  {leagues.map((l: LeagueListItem) => {
                    const isActive = l.id === leagueId;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => {
                          setLeagueId(l.id);
                          setAccountOpen(false);
                        }}
                        style={popoverRowStyle(isActive)}
                      >
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <SectionLabel>Settings</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button type="button" onClick={() => { setAccountOpen(false); nav("/profile"); }} style={popoverRowStyle(false)}>
                Profile
              </button>
              <button type="button" onClick={toggleTheme} style={popoverRowStyle(false)}>
                {theme === "dark" ? "Light theme" : "Dark theme"}
              </button>
              <button type="button" onClick={handleLogout} style={popoverRowStyle(false)}>
                Sign out
              </button>
            </div>
          </Glass>
        </div>
      )}

      {/* More popover — anchored below top bar, right-aligned */}
      {moreOpen && (
        <div
          ref={moreRef}
          style={{
            position: "fixed",
            top: 64,
            right: 18,
            zIndex: 40,
            width: "min(820px, calc(100vw - 36px))",
            maxHeight: "70vh",
            overflowY: "auto",
          }}
        >
          <Glass strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 18 }}>
              {moreSections.map((section) => {
                const visible = section.items.filter((i) => i.show !== false);
                if (visible.length === 0) return null;
                return (
                  <div key={section.title}>
                    <SectionLabel>{section.title}</SectionLabel>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {visible.map((item) => (
                        <button
                          key={item.to}
                          type="button"
                          onClick={() => handleNav(item.to)}
                          style={popoverRowStyle(false)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Glass>
        </div>
      )}

      {/* Main content — top padding clears the 56px sticky header */}
      <main
        id="main-content"
        style={{
          position: "relative",
          zIndex: 1,
          padding: "28px 16px 40px",
          minHeight: "calc(100svh - 56px)",
        }}
        key={leagueId}
      >
        {children}
      </main>
    </div>
  );
}

function popoverRowStyle(active: boolean): React.CSSProperties {
  return {
    textAlign: "left",
    padding: "8px 10px",
    borderRadius: 4,
    fontSize: 13,
    color: active ? "var(--am-text)" : "var(--am-text-muted)",
    background: active ? "var(--am-chip)" : "transparent",
    border: "1px solid " + (active ? "var(--am-border)" : "transparent"),
    cursor: "pointer",
    fontFamily: "inherit",
    width: "100%",
  };
}
