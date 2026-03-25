// client/src/components/AppShell.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { LeagueListItem } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { useTheme } from "../contexts/ThemeContext";
import { useLeague } from "../contexts/LeagueContext";
import { useSeasonGating } from "../hooks/useSeasonGating";
import { Logo } from "./ui/Logo";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";

const SIDEBAR_MIN = 64;
const SIDEBAR_COLLAPSED = 80;
const SIDEBAR_DEFAULT = 240;
const SIDEBAR_MAX = 320;
const SIDEBAR_SNAP_THRESHOLD = 100;

type NavItem = { to: string; label: string; show?: boolean; disabled?: boolean; disabledTip?: string };
type NavSection = { title: string; items: NavItem[]; collapsible?: boolean; defaultOpen?: boolean };

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

  // Escape key closes mobile drawer; Cmd+B toggles sidebar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && mobileOpen) setMobileOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpen(!sidebarOpen);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen, sidebarOpen, setSidebarOpen]);

  const canAccessCommissioner = useMemo(() => {
    if (Boolean(user?.isAdmin)) return true;
    const selected = (leagues ?? []).find((l: LeagueListItem) => l.id === leagueId);
    return selected?.access?.type === "MEMBER" && selected?.access?.role === "COMMISSIONER";
  }, [leagues, user, leagueId]);

  const NAV_SECTIONS: NavSection[] = [
    {
      title: "",
      items: [
        { to: "/", label: "Home", show: true },
        { to: "/season", label: "Season", show: true },
        { to: "/players", label: "Players", show: true },
        { to: "/auction", label: "Auction", show: true, disabled: !(gating.canAuction || gating.canViewAuctionResults), disabledTip: "Available during draft" },
        { to: "/draft", label: "Draft", show: true, disabled: !(gating.canAuction || gating.canViewAuctionResults), disabledTip: "Available during draft" },
        { to: "/matchup", label: "Matchup", show: gating.isH2H },
        { to: "/activity", label: "Activity", show: true },
      ],
    },
    {
      title: "AI",
      collapsible: true,
      defaultOpen: true,
      items: [
        { to: "/draft-report", label: "Draft Report", show: true },
        { to: "/ai", label: "AI Insights", show: true },
      ],
    },
    {
      title: "League",
      collapsible: true,
      defaultOpen: false,
      items: [
        { to: "/rules", label: "Rules", show: true },
        { to: "/payouts", label: "Payouts", show: true },
        { to: "/archive", label: "Archive", show: true },
        ...(leagueId ? [{ to: `/leagues/${leagueId}/keepers`, label: "Keepers", show: true }] : []),
        { to: "/about", label: "About", show: true },
        { to: "/guide", label: "Guide", show: true },
      ],
    },
    {
      title: "Manage",
      collapsible: true,
      defaultOpen: false,
      items: [
        { to: `/commissioner/${leagueId}`, label: "Commissioner", show: canAccessCommissioner },
        { to: "/admin", label: "Admin", show: Boolean(user?.isAdmin) },
      ],
    },
    {
      title: "Product",
      collapsible: true,
      defaultOpen: false,
      items: [
        { to: "/changelog", label: "Changelog", show: true },
        { to: "/roadmap", label: "Roadmap", show: true },
        { to: "/status", label: "Status", show: true },
        { to: "/tech", label: "Under the Hood", show: Boolean(user?.isAdmin) },
        { to: "/docs", label: "Docs", show: Boolean(user?.isAdmin) },
      ],
    },
  ];

  async function onLogout() {
    await logout();
    nav("/", { replace: true });
  }

  return (
    <div className={`min-h-screen scrollbar-hide ${isDragging ? 'cursor-col-resize select-none' : ''}`}>
      {/* Skip to main content — accessibility */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:p-3 focus:bg-[var(--lg-accent)] focus:text-white focus:rounded-lg focus:top-2 focus:left-2">
        Skip to main content
      </a>

      <div className="flex">
        {mobileOpen && sidebarVisible && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-300"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <Sidebar
          user={user}
          loading={loading}
          sidebarWidth={sidebarWidth}
          sidebarVisible={sidebarVisible}
          sidebarOpen={sidebarOpen}
          mobileOpen={mobileOpen}
          isDragging={isDragging}
          theme={theme}
          navSections={NAV_SECTIONS}
          leagues={leagues}
          leagueId={leagueId}
          canAccessCommissioner={canAccessCommissioner}
          onToggleTheme={toggleTheme}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onDragStart={onDragStart}
          onCloseMobile={() => setMobileOpen(false)}
          onSetLeagueId={setLeagueId}
          onLogout={onLogout}
        />

        <div className="flex-1 flex flex-col min-h-screen min-w-0 overflow-x-hidden transition-all duration-300">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--lg-border-faint)] px-4 py-3 lg:hidden bg-[var(--lg-bg-page)]/80 backdrop-blur-3xl" style={{ minHeight: '56px' }}>
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

            <button onClick={toggleTheme} className="p-2 text-[var(--lg-text-muted)]">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </header>

          <main id="main-content" className="flex-1 relative animate-in fade-in duration-700 pb-16 lg:pb-0">
            {!sidebarVisible && (
              <button
                onClick={() => setSidebarVisible(true)}
                className="fixed bottom-20 lg:bottom-8 left-8 z-50 p-4 rounded-2xl bg-[var(--lg-accent)] text-white shadow-2xl shadow-blue-500/40 hover:scale-110 active:scale-95 transition-all animate-in slide-in-from-left-4"
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

          <BottomNav onMore={() => setMobileOpen(true)} />
        </div>
      </div>
    </div>
  );
}
