
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
      <div className="flex items-center gap-1 p-2 bg-[var(--lg-tint)] border-b border-[var(--lg-border-subtle)]">
        {tabs.map((tab) => {
          const isActive = activeKey === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveKey(tab.key)}
              className={`
                relative px-5 py-2.5 text-xs font-bold uppercase tracking-wide rounded-xl transition-all
                ${isActive 
                  ? 'bg-[var(--lg-accent)] text-white shadow-lg shadow-red-500/10' 
                  : 'text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]'
                }
              `}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-2 text-xs tabular-nums ${isActive ? 'text-white/50' : 'text-[var(--lg-text-muted)]'}`}>
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
