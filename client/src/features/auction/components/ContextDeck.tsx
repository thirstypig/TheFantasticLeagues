
import React, { useState } from 'react';

interface TabItem {
  key: string;
  label: string;
  count?: number;
  badge?: boolean;
  content: React.ReactNode;
}

interface ContextDeckProps {
  tabs: TabItem[];
}

export default function ContextDeck({ tabs }: ContextDeckProps) {
  const [activeKey, setActiveKey] = useState(tabs[0].key);

  const activeTab = tabs.find(t => t.key === activeKey) || tabs[0];

  return (
    <div className="flex flex-col h-full w-full liquid-glass backdrop-blur-3xl">
      {/* Tab Bar — compact single row */}
      <div className="flex items-center gap-0 px-1 bg-[var(--lg-tint)] border-b border-[var(--lg-border-subtle)] shrink-0">
        {tabs.map((tab) => {
          const isActive = activeKey === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveKey(tab.key)}
              className={`
                relative px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide transition-all
                ${isActive
                  ? 'text-[var(--lg-accent)]'
                  : 'text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]'
                }
              `}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-0.5 tabular-nums ${isActive ? 'opacity-50' : 'opacity-30'}`}>
                  {tab.count}
                </span>
              )}
              {/* Active indicator line */}
              {isActive && (
                <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-[var(--lg-accent)] rounded-full" />
              )}
              {/* Unread badge */}
              {tab.badge && !isActive && (
                <span className="absolute top-1 right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--lg-accent)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-hidden relative" key={activeTab.key}>
        <div className="animate-in fade-in duration-300 h-full">
          {activeTab.content}
        </div>
      </div>
    </div>
  );
}
