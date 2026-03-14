// client/src/AppShell.tsx
import React from "react";
import { NavLink, Outlet } from "react-router-dom";

function navLinkClass({ isActive }: { isActive: boolean }) {
  return [
    "block rounded-xl px-4 py-2 text-sm transition-colors",
    isActive ? "bg-[var(--lg-tint-hover)] text-[var(--lg-text-primary)]" : "text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint)] hover:text-[var(--lg-text-primary)]",
  ].join(" ");
}

export default function AppShell() {
  return (
    <div className="min-h-screen bg-[var(--lg-bg-primary)] text-[var(--lg-text-primary)] flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-[var(--lg-border-faint)] px-4 py-6">
        <div className="mb-8">
          <div className="text-lg font-semibold">TFL</div>
          <div className="text-xs text-[var(--lg-text-muted)]">The Fantastic Leagues</div>
        </div>

        <nav className="space-y-2">
          {/* Home moved to top */}
          <NavLink to="/" className={navLinkClass}>
            Home
          </NavLink>

          <NavLink to="/period" className={navLinkClass}>
            Period
          </NavLink>

          <NavLink to="/season" className={navLinkClass}>
            Season
          </NavLink>

          <NavLink to="/teams" className={navLinkClass}>
            Teams
          </NavLink>

          <NavLink to="/players" className={navLinkClass}>
            Players
          </NavLink>

          {/* Auction removed */}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
