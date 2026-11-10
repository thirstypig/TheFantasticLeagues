/*
 * AuroraShell — Score Sheet chrome for the authenticated desktop layout.
 *
 * A ~220px left rail: app name, league/season label, the four primary tabs
 * (from navModel, shared with the mobile shell), a spacer, and an account
 * button at the bottom that opens a popover (account links, league switcher,
 * sign out). The content column flexes to fill. The theme toggle lives in
 * Profile → Appearance.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";

import type { LeagueListItem } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useTheme } from "../../contexts/ThemeContext";
import { useLeague } from "../../contexts/LeagueContext";
import { ACCOUNT_LINKS, activeTabFor, buildPrimaryTabs } from "../../lib/navModel";
import { Glass, SectionLabel } from "./atoms";
import "./aurora.css";

export default function AuroraShell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const { leagueId, setLeagueId, leagues, myTeamCode, currentSeason } = useLeague();

  // Sport accent class for the root div (NBA/NFL pages are still routed)
  const sportClass = location.pathname.startsWith("/nba")
    ? "sport-nba"
    : location.pathname.startsWith("/nfl")
      ? "sport-nfl"
      : "";

  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (accountOpen && accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [accountOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAccountOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const tabs = useMemo(() => buildPrimaryTabs({ myTeamCode }), [myTeamCode]);
  const activeKey = activeTabFor(location.pathname, myTeamCode);
  const accountLinks = ACCOUNT_LINKS(Boolean(user?.isAdmin));

  const currentLeague = leagues?.find((l: LeagueListItem) => l.id === leagueId);
  const leagueName = currentLeague?.name ?? "The Fantastic Leagues";

  async function handleLogout() {
    setAccountOpen(false);
    await logout();
    nav("/", { replace: true });
  }

  const userLabel = user?.email?.split("@")[0]?.slice(0, 18) ?? "Account";

  return (
    <div
      className={`aurora-theme ${sportClass} ${theme === "dark" ? "dark" : ""}`}
      style={{
        minHeight: "100svh",
        background: "var(--am-bg)",
        display: "flex",
        // Desktop has no top or bottom bar; see MobileShell for the mobile values.
        ["--shell-top-inset" as string]: "0px",
        ["--shell-bottom-inset" as string]: "0px",
      }}
    >
      <aside
        style={{
          position: "sticky",
          top: 0,
          alignSelf: "flex-start",
          height: "100svh",
          width: 220,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--am-surface)",
          borderRight: "1px solid var(--am-border-strong)",
          padding: "16px 12px",
          zIndex: 20,
        }}
      >
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
            padding: "0 4px",
            textAlign: "left",
            fontFamily: "inherit",
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
              color: "var(--am-on-accent)",
              flexShrink: 0,
            }}
          >
            F
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--am-text)", lineHeight: 1.2 }}>
            The Fantastic Leagues
          </span>
        </button>

        {/* League / season label (switching lives in the account popover) */}
        <div style={{ margin: "14px 4px 0", fontSize: 12, color: "var(--am-text-muted)" }}>
          {leagueName}
          {currentSeason ? ` · ${currentSeason}` : ""}
        </div>

        <nav
          aria-label="Main navigation"
          style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 20, minHeight: 0, overflowY: "auto" }}
        >
          {tabs.map((tab) => {
            const active = tab.key === activeKey;
            return (
              <Link
                key={tab.key}
                to={tab.to}
                aria-current={active ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 4,
                  fontSize: 16,
                  fontWeight: 600,
                  color: active ? "var(--am-text)" : "var(--am-text-muted)",
                  background: active ? "var(--am-chip)" : "transparent",
                  borderLeft: active ? "3px solid var(--am-accent)" : "3px solid transparent",
                  textDecoration: "none",
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        <div ref={accountRef} style={{ position: "relative" }}>
          <button
            type="button"
            aria-label="Account menu"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((v) => !v)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "10px 12px",
              background: "var(--am-chip)",
              border: "1px solid var(--am-border)",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 600,
              color: "var(--am-text)",
              fontFamily: "inherit",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {userLabel}
          </button>

          {accountOpen && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                left: 0,
                zIndex: 50,
                width: 280,
              }}
            >
              <Glass strong>
                <SectionLabel>Account</SectionLabel>
                <div style={{ fontSize: 13, color: "var(--am-text)", marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user?.email ?? "Signed in"}
                </div>

                {leagues && leagues.length > 1 && (
                  <>
                    <SectionLabel>Switch League</SectionLabel>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                      {leagues.map((l: LeagueListItem) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => {
                            setLeagueId(l.id);
                            setAccountOpen(false);
                          }}
                          style={popoverRowStyle(l.id === leagueId)}
                        >
                          {l.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <SectionLabel>Settings</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {accountLinks.map((link) => (
                    <button
                      key={link.to}
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        nav(link.to);
                      }}
                      style={popoverRowStyle(false)}
                    >
                      {link.label}
                    </button>
                  ))}
                  <button type="button" onClick={handleLogout} style={popoverRowStyle(false)}>
                    Sign out
                  </button>
                </div>
              </Glass>
            </div>
          )}
        </div>
      </aside>

      <main
        id="main-content"
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          minWidth: 0,
          padding: "28px 16px 40px",
          minHeight: "100svh",
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
