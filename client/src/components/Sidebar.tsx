// client/src/components/Sidebar.tsx
import React, { useCallback, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import type { LeagueListItem } from "../api";
import { Logo } from "./ui/Logo";

// ─── Types ───

type NavItem = { to: string; label: string; show?: boolean; disabled?: boolean; disabledTip?: string };
type NavSection = { title: string; items: NavItem[]; collapsible?: boolean; defaultOpen?: boolean };

export interface SidebarProps {
  user: { name?: string | null; email?: string | null; avatarUrl?: string | null; isAdmin?: boolean } | null;
  loading: boolean;
  sidebarWidth: number;
  sidebarVisible: boolean;
  sidebarOpen: boolean;
  mobileOpen: boolean;
  isDragging: boolean;
  theme: string;
  navSections: NavSection[];
  leagues: LeagueListItem[] | null;
  leagueId: number | null;
  canAccessCommissioner: boolean;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onCloseMobile: () => void;
  onSetLeagueId: (id: number) => void;
  onLogout: () => void;
}

// ─── Helpers ───

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}

const getNavIcon = (label: string) => {
  const icons: Record<string, JSX.Element> = {
    'Home': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
    'Season': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
    'Players': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
    'Payouts': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
    'Activity': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />,
    'About': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
    'Guide': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
    'Rules': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />,
    'Draft Report': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
    'Archive': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />,
    'Keepers': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />,
    'Commissioner': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />,
    'Admin': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />,
    'Auction': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />,
    'Changelog': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />,
    'Status': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
    'Roadmap': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />,
    'Under the Hood': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />,
    'AI Insights': <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></>
  };
  return icons[label] || <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />;
};

// ─── Component ───

export default function Sidebar({
  user, loading, sidebarWidth, sidebarVisible, sidebarOpen, mobileOpen, isDragging,
  theme, navSections, leagues, leagueId, canAccessCommissioner,
  onToggleTheme, onToggleSidebar, onDragStart, onCloseMobile, onSetLeagueId, onLogout,
}: SidebarProps) {
  const loc = useLocation();
  const nav = useNavigate();

  // Collapsible section state (persisted in localStorage)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      let raw = localStorage.getItem("fbst-nav-collapsed");
      if (raw && raw.includes('"Dev"')) {
        raw = raw.replace(/"Dev"/g, '"Product"');
        localStorage.setItem("fbst-nav-collapsed", raw);
      }
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const toggleSection = useCallback((title: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      localStorage.setItem("fbst-nav-collapsed", JSON.stringify(next));
      return next;
    });
  }, []);

  const renderNavLink = (item: NavItem) => {
    const active = isActive(loc.pathname, item.to);

    if (item.disabled) {
      return (
        <span
          key={item.label}
          className={`lg-sidebar-item opacity-30 cursor-not-allowed ${!sidebarOpen ? 'justify-center' : ''}`}
          title={item.disabledTip || item.label}
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {getNavIcon(item.label)}
          </svg>
          {sidebarOpen && <span className="truncate">{item.label}</span>}
        </span>
      );
    }

    return (
      <Link
        key={item.label}
        to={item.to}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          if (window.innerWidth < 1024) onCloseMobile();
        }}
        className={`lg-sidebar-item ${active ? 'active' : ''} ${!sidebarOpen ? 'justify-center' : ''}`}
        title={!sidebarOpen ? item.label : undefined}
      >
        <svg className={`w-5 h-5 flex-shrink-0 transition-transform ${active ? 'scale-110' : 'group-hover:scale-110'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {getNavIcon(item.label)}
        </svg>
        {sidebarOpen && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={`
        fixed lg:sticky top-0 h-screen z-50
        shrink-0 group
        lg-sidebar
        ${isDragging ? '' : 'transition-all duration-300'}
        ${!sidebarVisible ? 'w-0 overflow-hidden border-none px-0' : ''}
        ${!sidebarVisible ? '' : mobileOpen ? 'w-60' : '-translate-x-full lg:translate-x-0'}
      `}
      style={sidebarVisible ? { '--sidebar-w': `${sidebarWidth}px` } as React.CSSProperties : undefined}
    >
      <div className="px-3 py-5 h-full flex flex-col min-w-[64px]">
        <div className={`mb-5 flex items-center justify-between ${!sidebarOpen && 'flex-col gap-3'}`}>
          {sidebarOpen && (
            <Link
              to={user ? "/" : "/login"}
              className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
            >
              <Logo size={32} />
              <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight text-[var(--lg-text-heading)] leading-none">TFL</span>
                <span className="text-[10px] font-bold tracking-wide text-[var(--lg-text-muted)] opacity-60 uppercase mt-0.5">The Fantastic Leagues</span>
              </div>
            </Link>
          )}

          <div className={`flex items-center gap-0.5 ${!sidebarOpen && 'flex-col mx-auto'}`}>
            <button
              onClick={onToggleTheme}
              className="p-2.5 rounded-lg hover:bg-[var(--lg-tint)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-all"
              title="Toggle Theme"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              onClick={onToggleSidebar}
              className="p-2.5 rounded-lg hover:bg-[var(--lg-tint)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-all"
              title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <svg className={`w-4 h-4 transition-transform ${sidebarOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Season Switcher — Commissioner / Admin only */}
        {sidebarOpen && canAccessCommissioner && leagues && leagues.length > 1 && (
          <div className="mb-4">
            <select
              value={leagueId ?? ""}
              onChange={(e) => onSetLeagueId(Number(e.target.value))}
              className="w-full h-8 px-2.5 rounded-lg bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] text-xs font-semibold text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all cursor-pointer"
            >
              {(() => {
                const grouped = new Map<string, LeagueListItem[]>();
                for (const l of leagues) {
                  const key = l.franchiseId ? `fid:${l.franchiseId}` : `name:${l.name}`;
                  const arr = grouped.get(key) ?? [];
                  arr.push(l);
                  grouped.set(key, arr);
                }
                for (const arr of grouped.values()) arr.sort((a, b) => b.season - a.season);

                if (grouped.size === 1) {
                  const [, items] = [...grouped.entries()][0];
                  return items.map((l) => (
                    <option key={l.id} value={l.id}>{l.name} {l.season}</option>
                  ));
                }
                return [...grouped.entries()].map(([key, items]) => {
                  const label = items[0].name;
                  const seasonCounts = new Map<number, number>();
                  for (const l of items) seasonCounts.set(l.season, (seasonCounts.get(l.season) ?? 0) + 1);
                  const hasDupes = [...seasonCounts.values()].some((c) => c > 1);
                  return (
                    <optgroup key={key} label={label}>
                      {items.map((l) => (
                        <option key={l.id} value={l.id}>
                          {hasDupes ? `${l.name} ${l.season}` : `${l.season} Season`}
                        </option>
                      ))}
                    </optgroup>
                  );
                });
              })()}
            </select>
          </div>
        )}

        <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {navSections.map((section) => {
            const visibleItems = section.items.filter((item) => item.show !== false);
            if (visibleItems.length === 0) return null;

            const isCollapsible = section.collapsible && sidebarOpen;
            const isOpen = !isCollapsible || !(collapsedSections[section.title] ?? !section.defaultOpen);

            return (
              <div key={section.title || "_primary"}>
                {section.title && sidebarOpen && (
                  isCollapsible ? (
                    <button
                      onClick={() => toggleSection(section.title)}
                      className="lg-sidebar-section-label w-full flex items-center justify-between cursor-pointer hover:text-[var(--lg-text-primary)] transition-colors"
                      aria-expanded={isOpen}
                    >
                      <span>{section.title}</span>
                      <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <div className="lg-sidebar-section-label">
                      {section.title}
                    </div>
                  )
                )}
                {!sidebarOpen && section.title && (
                  <div className="h-px bg-[var(--lg-border-faint)] mx-2 my-2" />
                )}
                {isOpen && (
                  <div className="space-y-0.5">
                    {visibleItems.map(renderNavLink)}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className={`mt-3 pt-4 border-t border-[var(--lg-border-faint)] ${!sidebarOpen && 'flex flex-col items-center'}`}>
          {loading ? (
            <div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          ) : user ? (
            <div className={`flex items-center gap-2.5 ${!sidebarOpen && 'flex-col'}`}>
              <Link to="/profile" className="shrink-0">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name || 'User'} className="h-8 w-8 rounded-[var(--lg-radius-md)] grayscale hover:grayscale-0 transition-all border border-[var(--lg-border-subtle)]" />
                ) : (
                  <div className="h-8 w-8 rounded-[var(--lg-radius-md)] bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] flex items-center justify-center text-xs font-bold text-[var(--lg-text-muted)]">
                    {user.name?.[0] || 'U'}
                  </div>
                )}
              </Link>

              {sidebarOpen && (
                <>
                  <Link to="/profile" className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                    <div className="text-xs font-bold text-[var(--lg-text-primary)] truncate tracking-tight">{user.name || user.email}</div>
                  </Link>
                  <button
                    onClick={onLogout}
                    className="p-2 rounded-lg hover:bg-rose-500/10 text-[var(--lg-text-muted)] hover:text-rose-400 transition-all"
                    title="Sign Out"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </>
              )}

              {!sidebarOpen && (
                <button
                  onClick={onLogout}
                  className="p-2 rounded-lg hover:bg-rose-500/10 text-[var(--lg-text-muted)] hover:text-rose-400 transition-all"
                  title="Sign Out"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            <div className="w-full">
              <button
                onClick={() => nav('/login')}
                className={`
                  w-full flex items-center gap-2 rounded-xl bg-[var(--lg-accent)] text-white font-semibold transition-all shadow-lg shadow-blue-500/20
                  ${sidebarOpen ? 'px-4 py-2.5 justify-center' : 'p-2 justify-center'}
                `}
                title="Sign In"
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                {sidebarOpen && <span>Login</span>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Drag handle */}
      {sidebarVisible && (
        <div
          onMouseDown={onDragStart}
          className="hidden lg:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-[var(--lg-accent)]/30 active:bg-[var(--lg-accent)]/50 transition-colors z-10"
        />
      )}
    </aside>
  );
}
