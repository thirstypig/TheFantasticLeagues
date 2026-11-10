import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { activeTabFor, buildPrimaryTabs, type PrimaryTabKey } from "../lib/navModel";
import { Glyph, type GlyphKind } from "./atoms/Glyph";

const GLYPHS: Record<PrimaryTabKey, GlyphKind> = {
  today: "home",
  myTeam: "me",
  players: "players",
  league: "trophy",
};

interface MobileTabBarProps {
  myTeamCode?: string | null;
}

/** Fixed bottom bar: Today, My Team, Players, League. */
export function MobileTabBar({ myTeamCode }: MobileTabBarProps) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const tabs = buildPrimaryTabs({ myTeamCode });
  const active = activeTabFor(pathname, myTeamCode);

  return (
    <nav
      aria-label="Primary"
      data-testid="mobile-tab-bar"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        display: "flex",
        background: "var(--am-surface)",
        borderTop: "1px solid var(--am-border-strong)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            aria-current={on ? "page" : undefined}
            data-tab-key={t.key}
            onClick={() => nav(t.to)}
            style={{
              flex: 1,
              minWidth: 44,
              minHeight: 44,
              height: 64,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: on ? 700 : 500,
              color: on ? "var(--am-accent)" : "var(--am-text-muted)",
            }}
          >
            <Glyph kind={GLYPHS[t.key]} size={22} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
