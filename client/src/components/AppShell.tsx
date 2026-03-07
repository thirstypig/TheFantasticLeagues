// client/src/components/AppShell.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { getLeagues, type LeagueListItem } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { useTheme } from "../contexts/ThemeContext";

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

  const [leagues, setLeagues] = useState<LeagueListItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  useEffect(() => {
    if (user) {
      getLeagues()
        .then((resp) => setLeagues(resp.leagues ?? []))
        .catch(() => setLeagues([]));
    } else {
      setLeagues([]);
    }
  }, [user]);

  const commissionerLeagueId = useMemo(() => {
    const isAdmin = Boolean(user?.isAdmin);
    const commissioner = (leagues ?? []).find((l: LeagueListItem) => l?.access?.type === "MEMBER" && l?.access?.role === "COMMISSIONER");
    if (commissioner) return commissioner.id;
    if (isAdmin && (leagues?.length ?? 0) > 0) return leagues[0].id;
    return null;
  }, [leagues, user]);

  const getNavIcon = (label: string) => {
    const icons: Record<string, JSX.Element> = {
      'Home': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
      'Guide': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
      'Period': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
      'Season': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
      'Players': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
      'Trades': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />,
      'Transactions': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />,
      'Leagues': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />,
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
      title: "Navigation",
      items: [
        { to: "/", label: "Home", show: true },
        { to: "/guide", label: "Guide", show: true },
        { to: "/auction", label: "Auction", show: true },
      ],
    },
    {
      title: "Stats",
      items: [
        { to: "/period", label: "Period", show: true },
        { to: "/season", label: "Season", show: true },
        { to: "/players", label: "Players", show: true },
      ],
    },
    {
      title: "Activity",
      items: [
        { to: "/trades", label: "Trades", show: true },
        { to: "/transactions", label: "Transactions", show: true },
        { to: "/archive", label: "Archive", show: true },
      ],
    },
    {
      title: "Admin",
      items: [
        { to: "/leagues", label: "Leagues", show: true },
        {
          to: commissionerLeagueId ? `/commissioner/${commissionerLeagueId}#settings` : "/rules",
          label: "Rules",
          show: true,
        },
        {
          to: commissionerLeagueId ? `/commissioner/${commissionerLeagueId}` : "/leagues",
          label: "Commissioner",
          show: Boolean(commissionerLeagueId),
        },
        { to: "/admin", label: "Admin", show: Boolean(user?.isAdmin) },
      ],
    },
  ];

  async function onLogout() {
    await logout();
    setLeagues([]);
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
            setSidebarOpen(false);
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
    <div className="min-h-screen scrollbar-hide">
      <div className="flex">
        {sidebarOpen && sidebarVisible && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-300"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
            className={`
              fixed lg:sticky top-0 h-screen z-50
              shrink-0 transition-all duration-300 group
              lg-sidebar
              ${!sidebarVisible ? 'w-0 overflow-hidden border-none px-0' : ''}
              ${!sidebarOpen && sidebarVisible ? 'lg:w-20 -translate-x-full lg:translate-x-0' : ''}
              ${sidebarOpen && sidebarVisible ? 'w-60' : ''}
            `}
        >
          <div className="px-4 py-8 h-full flex flex-col min-w-[64px]">
            <div className={`mb-10 flex items-center justify-between ${!sidebarOpen && 'flex-col gap-6'}`}>
              {sidebarOpen && (
                <Link
                  to={user ? "/" : "/login"}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--lg-accent)] flex items-center justify-center text-white font-bold text-sm shadow-2xl shadow-blue-500/40 transform -rotate-3 hover:rotate-0 transition-transform duration-500">FBST</div>
                  <div className="flex flex-col">
                    <span className="text-xl font-bold tracking-tight text-[var(--lg-text-heading)] leading-none">FBST</span>
                    <span className="text-xs font-bold tracking-wide text-[var(--lg-text-muted)] opacity-60 uppercase mt-0.5">Fantasy Baseball Stat Tool</span>
                  </div>
                </Link>
              )}

              <div className={`flex items-center gap-1 ${!sidebarOpen && 'flex-col mx-auto'}`}>
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg hover:bg-[var(--lg-tint)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-all"
                  title="Toggle Theme"
                >
                  {theme === 'dark' ? '☀️' : '🌙'}
                </button>
                <button
                  onClick={() => setSidebarVisible(false)}
                  className="p-2 rounded-lg hover:bg-[var(--lg-tint)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-all"
                  title="Minimize Sidebar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </button>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto custom-scrollbar space-y-6">
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
                    <div className="space-y-1">
                      {visibleItems.map(renderNavLink)}
                    </div>
                  </div>
                );
              })}
            </nav>

            <div className={`mt-8 pt-8 border-t border-[var(--lg-border-faint)] ${!sidebarOpen && 'flex flex-col items-center'}`}>
              {loading ? (
                <div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              ) : user ? (
                <div className={`flex items-center gap-3 ${!sidebarOpen && 'flex-col'}`}>
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name || 'User'} className="h-10 w-10 rounded-[var(--lg-radius-md)] grayscale hover:grayscale-0 transition-all border border-[var(--lg-border-subtle)]" />
                  ) : (
                    <div className="h-10 w-10 rounded-[var(--lg-radius-md)] bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] flex items-center justify-center text-xs font-bold text-[var(--lg-text-muted)]">
                        {user.name?.[0] || 'U'}
                    </div>
                  )}

                  {sidebarOpen && (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] opacity-40 mb-0.5">Account</div>
                        <div className="text-xs font-bold text-[var(--lg-text-primary)] truncate uppercase tracking-tight">{user.name || user.email}</div>
                      </div>
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
        </aside>

        <div className="flex-1 flex flex-col min-h-screen transition-all duration-300">
          <header className={`sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--lg-border-faint)] px-6 py-5 lg:hidden bg-[var(--lg-bg-page)]/80 backdrop-blur-3xl`}>
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg-button lg-button-secondary p-2.5"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[var(--lg-accent)] flex items-center justify-center text-xs text-white font-bold">FB</div>
                <span className="text-xs font-bold tracking-wide uppercase text-[var(--lg-text-heading)]">FBST</span>
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
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            )}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
