import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Glyph, type GlyphKind } from "./atoms/Glyph";

export type MobileTabKey = "Home" | "Players" | "MyTeam" | "Standings" | "More";

interface TabDef {
  k: MobileTabKey;
  label: string;
  glyph: GlyphKind;
  to: string;
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
      matches: (p) => myTeamCode ? p.startsWith(`/teams/${myTeamCode}`) : false,
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
        display: "flex",
        flexDirection: "column",
        padding: "8px 0",
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
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              background: on ? "var(--am-chip)" : "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              width: "100%",
              borderLeft: on ? "3px solid var(--am-accent)" : "3px solid transparent",
            }}
          >
            <span
              style={{
                color: on ? "var(--am-accent)" : "var(--am-text-muted)",
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <Glyph kind={t.glyph} size={20} />
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: on ? 600 : 400,
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
