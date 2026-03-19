// client/src/components/AppShell.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import type { LeagueListItem } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { useTheme } from "../contexts/ThemeContext";
import { useLeague } from "../contexts/LeagueContext";
import { useSeasonGating } from "../hooks/useSeasonGating";
import { Logo } from "./ui/Logo";

const SIDEBAR_MIN = 64;
const SIDEBAR_COLLAPSED = 80;
const SIDEBAR_DEFAULT = 240;
const SIDEBAR_MAX = 320;
const SIDEBAR_SNAP_THRESHOLD = 100; // below this, snap to icon-only

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}

type NavItem = { to: string; label: string; show?: boolean };
type NavSection = { title: string; items: NavItem[] };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, loading, logout } = useAuth();
  const { leagueId, setLeagueId, leagues } = useLeague();
  const gating = useSeasonGating();

  // Persisted sidebar width
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem("fbst-sidebar-width");
    return stored ? Number(stored) : SIDEBAR_DEFAULT;
  });
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const sidebarOpen = sidebarWidth > SIDEBAR_SNAP_THRESHOLD;

  const setSidebarOpen = useCallback((open: boolean) => {
    const w = open ? SIDEBAR_DEFAULT : SIDEBAR_COLLAPSED;
    setSidebarWidth(w);
    localStorage.setItem("fbst-sidebar-width", String(w));
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: sidebarWidth };
    setIsDragging(true);
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isDragging) return;
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      const raw = dragRef.current.startW + delta;
      const clamped = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, raw));
      setSidebarWidth(clamped);
    }
    function onUp() {
      setIsDragging(false);
      // Snap to collapsed or expanded
      setSidebarWidth((w) => {
        const snapped = w < SIDEBAR_SNAP_THRESHOLD ? SIDEBAR_COLLAPSED : Math.max(SIDEBAR_SNAP_THRESHOLD, w);
        localStorage.setItem("fbst-sidebar-width", String(snapped));
        return snapped;
      });
      dragRef.current = null;
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  const canAccessCommissioner = useMemo(() => {
    if (Boolean(user?.isAdmin)) return true;
    const selected = (leagues ?? []).find((l: LeagueListItem) => l.id === leagueId);
    return selected?.access?.type === "MEMBER" && selected?.access?.role === "COMMISSIONER";
  }, [leagues, user, leagueId]);

  const getNavIcon = (label: string) => {
    const icons: Record<string, JSX.Element> = {
      'Home': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
      'Season': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
      'Players': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
      'Payouts': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
      'Activity': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />,
      'Rules': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />,
      'Archive': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />,
      'Commissioner': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />,
      'Admin': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />,
      'Auction': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    };
    return icons[label] || <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />;
  };

  const NAV_SECTIONS: NavSection[] = [
    {
      title: "My Team",
      items: [
        { to: "/", label: "Home", show: true },
      ],
    },
    {
      title: "Season",
      items: [
        { to: "/season", label: "Season", show: true },
        { to: "/players", label: "Players", show: true },
        { to: "/rules", label: "Rules", show: true },
      ],
    },
    {
      title: "Transactions",
      items: [
        { to: "/activity", label: "Activity", show: true },
        { to: "/auction", label: "Auction", show: true },
      ],
    },
    {
      title: "History",
      items: [
        { to: "/archive", label: "Archive", show: true },
        { to: "/payouts", label: "Payouts", show: true },
      ],
    },
    {
      title: "Management",
      items: [
        {
          to: `/commissioner/${leagueId}`,
          label: "Commissioner",
          show: canAccessCommissioner,
        },
        { to: "/admin", label: "Admin", show: Boolean(user?.isAdmin) },
      ],
    },
  ];

  async function onLogout() {
    await logout();
    nav("/", { replace: true });
  }

  const renderNavLink = (item: NavItem) => {
    const active = isActive(loc.pathname, item.to);
    return (
      <Link
        key={item.label}
        to={item.to}
        onClick={() => {
          if (window.innerWidth < 1024) {
            setMobileOpen(false);
          }
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
    <div className={`min-h-screen scrollbar-hide ${isDragging ? 'cursor-col-resize select-none' : ''}`}>
      <div className="flex">
        {mobileOpen && sidebarVisible && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-300"
            onClick={() => setMobileOpen(false)}
          />
        )}

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
                  onClick={toggleTheme}
                  className="p-1.5 rounded-lg hover:bg-[var(--lg-tint)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-all"
                  title="Toggle Theme"
                  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {theme === 'dark' ? '☀️' : '🌙'}
                </button>
                <button
                  onClick={() => setSidebarVisible(false)}
                  className="p-1.5 rounded-lg hover:bg-[var(--lg-tint)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-all"
                  title="Minimize Sidebar"
                  aria-label="Minimize sidebar"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  onChange={(e) => setLeagueId(Number(e.target.value))}
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
                      // Check for duplicate season years within this group
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

            <nav className="flex-1 space-y-3 overflow-y-auto" aria-label="Main navigation">
              {NAV_SECTIONS.map((section) => {
                const visibleItems = section.items.filter((item) => item.show);
                if (visibleItems.length === 0) return null;

                return (
                  <div key={section.title}>
                    {sidebarOpen && (
                      <div className="lg-sidebar-section-label">
                        {section.title}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {visibleItems.map(renderNavLink)}
                    </div>
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

        <div className="flex-1 flex flex-col min-h-screen transition-all duration-300">
          <header className={`sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--lg-border-faint)] px-6 py-5 lg:hidden bg-[var(--lg-bg-page)]/80 backdrop-blur-3xl`}>
            <button
              onClick={() => setMobileOpen(true)}
              className="lg-button lg-button-secondary p-2.5"
              aria-label="Open navigation menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-center gap-2">
                <Logo size={24} />
                <span className="text-xs font-bold tracking-wide uppercase text-[var(--lg-text-heading)]">TFL</span>
            </div>

            <button
              onClick={toggleTheme}
              className="p-2 text-[var(--lg-text-muted)]"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </header>

          <main className="flex-1 relative animate-in fade-in duration-700">
            {!sidebarVisible && (
              <button
                onClick={() => setSidebarVisible(true)}
                className="fixed bottom-8 left-8 z-50 p-4 rounded-2xl bg-[var(--lg-accent)] text-white shadow-2xl shadow-blue-500/40 hover:scale-110 active:scale-95 transition-all animate-in slide-in-from-left-4"
                title="Restore Navigation"
                aria-label="Restore navigation sidebar"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            )}
            <div key={leagueId}>{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
