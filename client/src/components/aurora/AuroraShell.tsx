/*
 * AuroraShell — the Aurora design system's app chrome (replaces AppShell).
 *
 * Renders every authenticated page inside:
 *   .aurora-theme + AmbientBg + Topbar (top) + Dock (bottom-center)
 *
 * Per the Aurora System.html design handoff, the dock surfaces only the
 * 6 most-used routes (Home, Matchup, My Team, Standings, Players, AI).
 * Less-frequent routes live behind the dock's "More" popover. The
 * Topbar carries the league name/season, a quick chip strip, and an
 * iridescent avatar that opens an account/league/theme menu.
 *
 * The legacy AppShell (sidebar) is preserved on disk in case we need
 * to roll back, but App.tsx no longer uses it.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { LeagueListItem } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useTheme } from "../../contexts/ThemeContext";
import { useLeague } from "../../contexts/LeagueContext";
import { useSeasonGating } from "../../hooks/useSeasonGating";
import { AmbientBg, Chip, Dock, Dot, Glass, SectionLabel, Topbar, type DockItem } from "./atoms";
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
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { leagueId, setLeagueId, leagues, draftMode, myTeamCode, currentSeason } = useLeague();
  const gating = useSeasonGating();

  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  // Close popovers on outside click
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

  // Escape closes popovers
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

  const dockItems: DockItem[] = useMemo(() => {
    const items: DockItem[] = [{ key: "Home", label: "Home", glyph: "◐", to: "/" }];
    if (gating.isH2H) items.push({ key: "Matchup", label: "Matchup", glyph: "◇", to: "/matchup" });
    if (myTeamCode) items.push({ key: "MyTeam", label: "My Team", glyph: "◆", to: "/my-team" });
    items.push({ key: "Standings", label: "Standings", glyph: "▤", to: "/season" });
    items.push({ key: "Players", label: "Players", glyph: "✦", to: "/players" });
    items.push({ key: "AI", label: "AI", glyph: "✧", to: "/ai" });
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
  const subtitle = currentSeason ? `${currentSeason}` : undefined;

  async function handleLogout() {
    setAccountOpen(false);
    await logout();
    nav("/", { replace: true });
  }

  function handleNav(to: string) {
    setMoreOpen(false);
    nav(to);
  }

  return (
    <div className={`aurora-theme ${theme === "dark" ? "dark" : ""}`} style={{ position: "relative", minHeight: "100svh", background: "var(--am-bg)" }}>
      <AmbientBg />

      <Topbar
        title={leagueName}
        subtitle={subtitle}
        onLogoClick={() => nav("/")}
        onAvatarClick={() => setAccountOpen((v) => !v)}
        right={
          <Chip strong>
            <Dot color="var(--am-cardinal)" />
            {gating.canAuction
              ? "Draft window open"
              : gating.seasonStatus === "IN_SEASON"
              ? "In season"
              : gating.seasonStatus === "COMPLETED"
              ? "Season complete"
              : "Pre-season"}
          </Chip>
        }
      />

      {/* Account popover (anchored under the avatar; absolute) */}
      {accountOpen && (
        <div
          ref={accountRef}
          style={{
            position: "fixed",
            top: 56,
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
                  borderRadius: 99,
                  background: "var(--am-irid)",
                  border: "1px solid var(--am-border-strong)",
                }}
              />
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
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          borderRadius: 10,
                          fontSize: 12,
                          background: isActive ? "var(--am-chip-strong)" : "transparent",
                          color: isActive ? "var(--am-text)" : "var(--am-text-muted)",
                          border: "1px solid " + (isActive ? "var(--am-border-strong)" : "transparent"),
                          cursor: "pointer",
                        }}
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
              <button type="button" onClick={() => { setAccountOpen(false); nav("/profile"); }} style={menuRowStyle()}>
                Profile
              </button>
              <button type="button" onClick={toggleTheme} style={menuRowStyle()}>
                {theme === "dark" ? "Light theme" : "Dark theme"}
              </button>
              <button type="button" onClick={handleLogout} style={menuRowStyle()}>
                Sign out
              </button>
            </div>
          </Glass>
        </div>
      )}

      {/* More popover (anchored above the dock; centered like the dock) */}
      {moreOpen && (
        <div
          ref={moreRef}
          style={{
            position: "fixed",
            bottom: 92,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 40,
            width: "min(820px, calc(100vw - 32px))",
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
                          style={menuRowStyle()}
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

      <Dock
        items={dockItems}
        extra={
          <button
            type="button"
            aria-label="More"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderRadius: 16,
              fontSize: 13,
              fontWeight: 500,
              color: moreOpen ? "var(--am-text)" : "var(--am-text-muted)",
              background: moreOpen ? "var(--am-chip-strong)" : "transparent",
              border: "1px solid " + (moreOpen ? "var(--am-border-strong)" : "transparent"),
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 14 }}>⋯</span>
            More
          </button>
        }
      />

      {/* Main content. Top padding clears Topbar (~64px), bottom padding clears Dock (~110px). */}
      <main
        id="main-content"
        style={{
          position: "relative",
          zIndex: 1,
          padding: "72px 16px 120px",
          minHeight: "100svh",
        }}
        key={leagueId}
      >
        {children}
      </main>
    </div>
  );
}

function menuRowStyle(): React.CSSProperties {
  return {
    textAlign: "left",
    padding: "8px 10px",
    borderRadius: 10,
    fontSize: 13,
    color: "var(--am-text)",
    background: "transparent",
    border: "1px solid transparent",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
