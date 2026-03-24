// client/src/components/BottomNav.tsx
import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Home", exact: true, icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /> },
  { to: "/season", label: "Season", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
  { to: "/players", label: "Players", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /> },
  { to: "/activity", label: "Activity", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" /> },
] as const;

export default function BottomNav({ onMore }: { onMore: () => void }) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 lg:hidden border-t border-[var(--lg-border-subtle)] bg-[var(--lg-bg-card)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Quick navigation"
    >
      <div className="flex items-center justify-around" style={{ height: 56 }}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={"exact" in tab ? tab.exact : false}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-2 min-w-[64px] min-h-[44px] justify-center transition-colors ${
                isActive ? "text-[var(--lg-accent)]" : "text-[var(--lg-text-muted)]"
              }`
            }
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {tab.icon}
            </svg>
            <span className="text-[10px] font-medium">{tab.label}</span>
          </NavLink>
        ))}
        <button
          onClick={onMore}
          className="flex flex-col items-center gap-0.5 px-3 py-2 min-w-[64px] min-h-[44px] justify-center text-[var(--lg-text-muted)] transition-colors"
          aria-label="More navigation options"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="text-[10px] font-medium">More</span>
        </button>
      </div>
    </nav>
  );
}
