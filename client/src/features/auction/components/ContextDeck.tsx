
import React, { useState } from 'react';

interface TabItem {
  key: string;
  label: string;
  count?: number;
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
      {/* Tab Bar */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-[var(--lg-tint)] border-b border-[var(--lg-border-subtle)]">
        {tabs.map((tab) => {
          const isActive = activeKey === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveKey(tab.key)}
              className={`
                px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide rounded-md transition-all
                ${isActive
                  ? 'bg-[var(--lg-accent)] text-white'
                  : 'text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint-hover)]'
                }
              `}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-1 tabular-nums ${isActive ? 'text-white/50' : ''}`}>
                  {tab.count}
                </span>
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
