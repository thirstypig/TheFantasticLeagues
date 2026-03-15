
import React, { ReactNode, useState } from 'react';
import { Columns2, Rows2 } from 'lucide-react';

interface AuctionLayoutProps {
  stage: ReactNode;
  context: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
}

export default function AuctionLayout({ stage, context }: AuctionLayoutProps) {
  const [layout, setLayout] = useState<'stacked' | 'side'>(() => {
    return (localStorage.getItem('fbst-auction-layout') as 'stacked' | 'side') || 'stacked';
  });

  const toggleLayout = (mode: 'stacked' | 'side') => {
    setLayout(mode);
    localStorage.setItem('fbst-auction-layout', mode);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[var(--lg-glass-bg)] text-[var(--lg-text-primary)]">
      {/* Compact header with layout toggle */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--lg-table-border)] bg-[var(--lg-bg-secondary)] shrink-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)]">Auction Draft</div>
        <div className="hidden md:flex bg-[var(--lg-tint)] rounded-md p-0.5 border border-[var(--lg-border-subtle)]">
          <button
            onClick={() => toggleLayout('stacked')}
            className={`p-1 rounded transition-all ${layout === 'stacked' ? 'bg-[var(--lg-accent)] text-white' : 'text-[var(--lg-text-muted)]'}`}
            title="Stacked layout"
          >
            <Rows2 size={14} />
          </button>
          <button
            onClick={() => toggleLayout('side')}
            className={`p-1 rounded transition-all ${layout === 'side' ? 'bg-[var(--lg-accent)] text-white' : 'text-[var(--lg-text-muted)]'}`}
            title="Side-by-side layout"
          >
            <Columns2 size={14} />
          </button>
        </div>
      </div>

      {layout === 'stacked' ? (
        /* Stacked: nomination on top, player pool below */
        <div className="flex flex-col h-full overflow-hidden">
          <section className="shrink-0 border-b border-[var(--lg-table-border)] bg-[var(--lg-bg-secondary)] overflow-y-auto max-h-[45vh]">
            <div className="p-3">{stage}</div>
          </section>
          <section className="flex-1 overflow-hidden flex flex-col">
            {context}
          </section>
        </div>
      ) : (
        /* Side-by-side: nomination left, player pool right */
        <div className="flex flex-col md:flex-row h-full overflow-hidden">
          <section className="shrink-0 md:w-[380px] border-b md:border-b-0 md:border-r border-[var(--lg-table-border)] bg-[var(--lg-bg-secondary)] overflow-y-auto">
            <div className="p-3">{stage}</div>
          </section>
          <section className="flex-1 overflow-hidden flex flex-col">
            {context}
          </section>
        </div>
      )}
    </div>
  );
}
