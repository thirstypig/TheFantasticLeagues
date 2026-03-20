import React from 'react';
import { Volume2, MessageCircle, Star, DollarSign, TrendingUp, BarChart3 } from 'lucide-react';
import type { AuctionPrefs } from '../hooks/useAuctionPrefs';

interface AuctionSettingsTabProps {
  prefs: AuctionPrefs;
  onToggle: (key: keyof AuctionPrefs) => void;
}

const SETTINGS: Array<{ key: keyof AuctionPrefs; icon: React.ElementType; label: string; desc: string }> = [
  { key: 'sounds', icon: Volume2, label: 'Sound Effects', desc: 'Audio alerts for nominations, outbids, wins, and your turn' },
  { key: 'chat', icon: MessageCircle, label: 'Chat', desc: 'Real-time chat with other owners during the draft' },
  { key: 'watchlist', icon: Star, label: 'Watchlist', desc: 'Star icon on players and filtered view in Player Pool' },
  { key: 'openingBidPicker', icon: DollarSign, label: 'Opening Bid Picker', desc: 'Choose your starting bid when nominating (vs. always $1)' },
  { key: 'valueColumn', icon: TrendingUp, label: 'Value / Surplus', desc: 'Show projected value and surplus during bidding' },
  { key: 'spendingPace', icon: BarChart3, label: 'Spending Pace', desc: 'Budget bars, avg cost, and hot/cold indicators on Teams tab' },
];

export default function AuctionSettingsTab({ prefs, onToggle }: AuctionSettingsTabProps) {
  return (
    <div className="h-full overflow-y-auto px-4 py-3 space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] mb-3">
        Personal Preferences
      </div>
      {SETTINGS.map(s => (
        <button
          key={s.key}
          onClick={() => onToggle(s.key)}
          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--lg-tint)] transition-colors text-left group"
        >
          <s.icon size={16} className={prefs[s.key] ? 'text-[var(--lg-accent)]' : 'text-[var(--lg-text-muted)] opacity-30'} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[var(--lg-text-primary)]">{s.label}</div>
            <div className="text-[10px] text-[var(--lg-text-muted)] leading-snug">{s.desc}</div>
          </div>
          {/* Toggle switch */}
          <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors shrink-0 ${prefs[s.key] ? 'bg-[var(--lg-accent)]' : 'bg-[var(--lg-border-subtle)]'}`}>
            <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${prefs[s.key] ? 'translate-x-3.5' : 'translate-x-0'}`} />
          </div>
        </button>
      ))}
      <div className="pt-3 text-[10px] text-[var(--lg-text-muted)] opacity-40 text-center">
        These settings are saved locally per device
      </div>
    </div>
  );
}
