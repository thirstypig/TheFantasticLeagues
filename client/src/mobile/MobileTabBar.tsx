import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Glyph, type GlyphKind } from "./atoms/Glyph";

export type MobileTabKey = "Home" | "Players" | "MyTeam" | "Standings" | "More";
export type MobileRole = "manager" | "commish";

interface TabDef {
  k: MobileTabKey;
  label: string;
  glyph: GlyphKind;
  to: string;
  /** When the current path startsWith one of these, this tab is active. */
  matches: (path: string) => boolean;
}

function buildTabs(myTeamCode: string | null | undefined): TabDef[] {
  return [
    {
      k: "Home",
      label: "Home",
      glyph: "home",
      to: "/",
      matches: (p) => p === "/",
    },
    {
      k: "Players",
      label: "Players",
      glyph: "players",
      to: "/players",
      matches: (p) => p === "/players" || p.startsWith("/players/"),
    },
    {
      k: "MyTeam",
      label: "My Team",
      glyph: "me",
      to: myTeamCode ? `/teams/${myTeamCode}` : "/teams",
      matches: (p) => p.startsWith("/teams/"),
    },
    {
      k: "Standings",
      label: "Standings",
      glyph: "trophy",
      to: "/season",
      matches: (p) => p === "/season" || p.startsWith("/season/"),
    },
    {
      k: "More",
      label: "More",
      glyph: "more",
      to: "/more",
      matches: (p) => p === "/more" || p.startsWith("/more/"),
    },
  ];
}

interface MobileTabBarProps {
  myTeamCode?: string | null;
}

export function MobileTabBar({ myTeamCode }: MobileTabBarProps) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const tabs = buildTabs(myTeamCode);

  return (
    <nav
      aria-label="Primary"
      data-testid="mobile-tab-bar"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        paddingTop: 8,
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
        background: "var(--am-surface-strong)",
        backdropFilter: "blur(40px) saturate(200%)",
        WebkitBackdropFilter: "blur(40px) saturate(200%)",
        borderTop: "1px solid var(--am-border-strong)",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.25)",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "stretch",
      }}
    >
      {tabs.map((t) => {
        const on = t.matches(pathname);
        return (
          <button
            key={t.k}
            type="button"
            aria-current={on ? "page" : undefined}
            data-tab-key={t.k}
            onClick={() => nav(t.to)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "6px 4px",
              minHeight: 44,
              position: "relative",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {on && (
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  left: "30%",
                  right: "30%",
                  height: 3,
                  borderRadius: 99,
                  background: "var(--am-irid)",
                }}
              />
            )}
            <span
              style={{
                color: on ? "var(--am-text)" : "var(--am-text-muted)",
                transform: on ? "scale(1.05)" : "scale(1)",
                display: "block",
              }}
            >
              <Glyph kind={t.glyph} size={24} />
            </span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: on ? 700 : 500,
                letterSpacing: 0.1,
                color: on ? "var(--am-text)" : "var(--am-text-muted)",
              }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
