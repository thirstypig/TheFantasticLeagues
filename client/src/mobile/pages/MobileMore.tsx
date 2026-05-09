/*
 * MobileMore — Aurora mobile twin for `/more`.
 *
 * Pure navigation page: profile strip on top, then grouped sections
 * (League · Commissioner [conditional] · Account). Every row is a
 * Link to a real route — no new pages, no new APIs. The design's
 * Commissioner section appears only when the user has commissioner
 * access for the active league (mirrors the role check AuroraShell
 * uses for its sidebar dock).
 */
import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useLeague } from "../../contexts/LeagueContext";
import { useTheme } from "../../contexts/ThemeContext";
import type { LeagueListItem } from "../../api";
import { MobileTopbar } from "../MobileTopbar";
import { MCard } from "../atoms/MCard";
import { Glyph, type GlyphKind } from "../atoms/Glyph";

interface MoreItemDef {
  key: string;
  icon: GlyphKind;
  title: string;
  sub?: string;
  to?: string;
  onClick?: () => void;
  badge?: string | number;
}

interface MoreGroupProps {
  label: string;
  accent?: boolean;
  children: React.ReactNode;
}

function MoreGroup({ label, accent, children }: MoreGroupProps) {
  return (
    <div style={{ padding: "0 14px 14px" }}>
      <div style={{ padding: "0 4px 6px", display: "flex", alignItems: "center", gap: 6 }}>
        {accent && (
          <span style={{ width: 4, height: 4, borderRadius: 99, background: "var(--am-accent)" }} />
        )}
        <div
          style={{
            fontSize: 9.5,
            letterSpacing: 1.1,
            fontWeight: 700,
            color: accent ? "var(--am-accent)" : "var(--am-text-faint)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      </div>
      <MCard padded={false}>{children}</MCard>
    </div>
  );
}

interface MoreItemProps {
  item: MoreItemDef;
  isFirst: boolean;
}

function MoreItemRow({ item, isFirst }: MoreItemProps) {
  const inner = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr auto auto",
        gap: 12,
        alignItems: "center",
        padding: "11px 14px",
        borderTop: isFirst ? "none" : "1px solid var(--am-border)",
        cursor: item.to || item.onClick ? "pointer" : "default",
        textDecoration: "none",
        color: "var(--am-text)",
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: "var(--am-chip-strong)",
          border: "1px solid var(--am-border)",
          display: "grid",
          placeItems: "center",
          color: "var(--am-text-muted)",
        }}
      >
        <Glyph kind={item.icon} size={15} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: "var(--am-text)", fontWeight: 500 }}>{item.title}</div>
        {item.sub && (
          <div style={{ fontSize: 10.5, color: "var(--am-text-faint)" }}>{item.sub}</div>
        )}
      </div>
      {item.badge != null ? (
        <span
          style={{
            padding: "2px 7px",
            borderRadius: 99,
            fontSize: 10,
            fontWeight: 700,
            background: "var(--am-irid)",
            color: "#fff",
          }}
        >
          {item.badge}
        </span>
      ) : (
        <span />
      )}
      <Glyph kind="chevR" size={14} />
    </div>
  );
  if (item.to) {
    return (
      <Link
        to={item.to}
        data-testid="mobile-more-item"
        data-item-key={item.key}
        style={{ display: "block", textDecoration: "none", color: "inherit" }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      data-testid="mobile-more-item"
      data-item-key={item.key}
      onClick={item.onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "none",
        padding: 0,
        fontFamily: "inherit",
        color: "inherit",
        cursor: item.onClick ? "pointer" : "default",
      }}
    >
      {inner}
    </button>
  );
}

export function MobileMore() {
  const { user, me, logout } = useAuth();
  const { leagueId, leagues, currentLeagueName } = useLeague();
  const { theme, toggleTheme } = useTheme();

  const isCommish = useMemo(() => {
    if (user?.isAdmin) return true;
    const selected = (leagues ?? []).find((l: LeagueListItem) => l.id === leagueId);
    return selected?.access?.type === "MEMBER" && selected?.access?.role === "COMMISSIONER";
  }, [user, leagues, leagueId]);

  const profileName = me?.user?.name ?? user?.name ?? "Welcome";
  const profileInitials =
    profileName
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "—";

  const leagueItems: MoreItemDef[] = [
    { key: "standings", icon: "trophy", title: "Standings", sub: "Roto · 5×5", to: "/season" },
    { key: "transactions", icon: "trade", title: "Transactions", sub: "League activity", to: "/activity" },
    { key: "weekly-report", icon: "ai", title: "Weekly Report", sub: "AI digest", to: "/weekly-report" },
    { key: "board", icon: "more", title: "Board", sub: "Manager chatter", to: "/board" },
  ];

  const commishItems: MoreItemDef[] = [
    { key: "league-settings", icon: "cog", title: "League settings", sub: "Rules, scoring, slots", to: leagueId ? `/commissioner/${leagueId}` : "/commissioner" },
    { key: "trade-approvals", icon: "trade", title: "Trade approvals", sub: "Review pending offers", to: "/activity" },
    { key: "wire-list", icon: "calendar", title: "Wire list", sub: "Period processing", to: leagueId ? `/commissioner/${leagueId}/wire-list` : "/commissioner" },
    { key: "auction", icon: "trophy", title: "Auction setup", sub: "Cap, draft order", to: "/auction" },
  ];

  const accountItems: MoreItemDef[] = [
    {
      key: "appearance",
      icon: "cog",
      title: "Appearance",
      sub: theme === "dark" ? "Aurora · Dark" : "Aurora · Light",
      onClick: toggleTheme,
    },
    { key: "profile", icon: "me", title: "Profile", sub: "Edit name, photo, email", to: "/profile" },
  ];

  return (
    <div data-testid="mobile-more">
      <MobileTopbar
        title={isCommish ? "Commissioner" : "More"}
        subtitle={isCommish ? "League tools + your account" : currentLeagueName || "League, account, settings"}
        leading={<Glyph kind="cog" size={20} />}
      />

      {/* PROFILE STRIP */}
      <div style={{ padding: "0 14px 14px" }}>
        <Link
          to="/profile"
          data-testid="mobile-more-profile"
          style={{ textDecoration: "none", color: "inherit", display: "block" }}
        >
          <MCard strong>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: "var(--am-irid)",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontFamily: "var(--am-display)",
                  fontSize: 18,
                }}
              >
                {profileInitials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--am-text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {profileName}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--am-text-muted)" }}>
                  {isCommish ? "Commissioner" : "Manager"}
                  {currentLeagueName ? ` · ${currentLeagueName}` : ""}
                </div>
              </div>
              <Glyph kind="chevR" size={16} />
            </div>
          </MCard>
        </Link>
      </div>

      <MoreGroup label="League">
        {leagueItems.map((item, i) => (
          <MoreItemRow key={item.key} item={item} isFirst={i === 0} />
        ))}
      </MoreGroup>

      {isCommish && (
        <MoreGroup label="Commissioner" accent>
          {commishItems.map((item, i) => (
            <MoreItemRow key={item.key} item={item} isFirst={i === 0} />
          ))}
        </MoreGroup>
      )}

      <MoreGroup label="Account">
        {accountItems.map((item, i) => (
          <MoreItemRow key={item.key} item={item} isFirst={i === 0} />
        ))}
      </MoreGroup>

      <div style={{ padding: "0 14px 24px", textAlign: "center" }}>
        <button
          type="button"
          onClick={() => logout()}
          data-testid="mobile-more-signout"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--am-text-faint)",
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "8px 16px",
            minHeight: 32,
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
