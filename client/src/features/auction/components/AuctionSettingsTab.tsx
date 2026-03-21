import React, { useState, useRef } from 'react';
import { Volume2, Bell, MessageCircle, Star, DollarSign, TrendingUp, BarChart3, Globe, Upload, FileText, Trash2 } from 'lucide-react';
import type { AuctionPrefs, LeagueFilter } from '../hooks/useAuctionPrefs';

interface AuctionSettingsTabProps {
  prefs: AuctionPrefs;
  onToggle: (key: keyof AuctionPrefs) => void;
  onUpdate: <K extends keyof AuctionPrefs>(key: K, value: AuctionPrefs[K]) => void;
  rankingsCount?: number;
  onImportRankings?: (csvText: string) => { imported: number; errors: string[] };
  onClearRankings?: () => void;
}

const TOGGLE_SETTINGS: Array<{ key: keyof AuctionPrefs; icon: React.ElementType; label: string; desc: string }> = [
  { key: 'sounds', icon: Volume2, label: 'Sound Effects', desc: 'Audio alerts for nominations, outbids, wins, and your turn' },
  { key: 'notifications', icon: Bell, label: 'Browser Notifications', desc: 'Desktop alerts when it\'s your turn, you\'re outbid, or you win a player' },
  { key: 'chat', icon: MessageCircle, label: 'Chat', desc: 'Real-time chat with other owners during the draft' },
  { key: 'watchlist', icon: Star, label: 'Watchlist', desc: 'Star icon on players and filtered view in Player Pool' },
  { key: 'openingBidPicker', icon: DollarSign, label: 'Opening Bid Picker', desc: 'Choose your starting bid when nominating (vs. always $1)' },
  { key: 'valueColumn', icon: TrendingUp, label: 'Value / Surplus', desc: 'Show projected value and surplus during bidding' },
  { key: 'spendingPace', icon: BarChart3, label: 'Spending Pace', desc: 'Budget bars, avg cost, and hot/cold indicators on Teams tab' },
];

export default function AuctionSettingsTab({ prefs, onToggle, onUpdate, rankingsCount = 0, onImportRankings, onClearRankings }: AuctionSettingsTabProps) {
  const [pasteText, setPasteText] = useState('');
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportRankings) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        const result = onImportRankings(text);
        setImportResult(result);
        setPasteText('');
        setShowPaste(false);
      }
    };
    reader.readAsText(file);

    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handlePasteImport = () => {
    if (!pasteText.trim() || !onImportRankings) return;
    const result = onImportRankings(pasteText);
    setImportResult(result);
    if (result.imported > 0) {
      setPasteText('');
      setShowPaste(false);
    }
  };

  const handleClear = () => {
    onClearRankings?.();
    setImportResult(null);
    setPasteText('');
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-3 space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] mb-3">
        Personal Preferences
      </div>

      {/* Toggle settings */}
      {TOGGLE_SETTINGS.map(s => (
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
          <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors shrink-0 ${prefs[s.key] ? 'bg-[var(--lg-accent)]' : 'bg-[var(--lg-border-subtle)]'}`}>
            <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${prefs[s.key] ? 'translate-x-3.5' : 'translate-x-0'}`} />
          </div>
        </button>
      ))}

      {/* Default league filter */}
      <div className="flex items-center gap-3 p-3 rounded-lg">
        <Globe size={16} className="text-[var(--lg-accent)]" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-[var(--lg-text-primary)]">Default League Filter</div>
          <div className="text-[10px] text-[var(--lg-text-muted)] leading-snug">Set your default Player Pool filter</div>
        </div>
        <div className="flex bg-[var(--lg-tint)] rounded-md p-0.5 border border-[var(--lg-border-subtle)] shrink-0">
          {(['ALL', 'NL', 'AL'] as LeagueFilter[]).map(f => (
            <button
              key={f}
              onClick={() => onUpdate('defaultLeagueFilter', f)}
              className={`px-2.5 py-1 text-[10px] font-semibold uppercase rounded transition-all ${
                prefs.defaultLeagueFilter === f ? 'bg-[var(--lg-accent)] text-white' : 'text-[var(--lg-text-muted)]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* My Rankings section */}
      {onImportRankings && (
        <>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] mt-4 mb-2 pt-3 border-t border-[var(--lg-border-faint)]">
            My Rankings
          </div>

          <div className="p-3 rounded-lg space-y-3">
            {/* Current status */}
            <div className="flex items-center gap-3">
              <FileText size={16} className={rankingsCount > 0 ? 'text-[var(--lg-accent)]' : 'text-[var(--lg-text-muted)] opacity-30'} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[var(--lg-text-primary)]">
                  {rankingsCount > 0 ? `${rankingsCount} players ranked` : 'No rankings imported'}
                </div>
                <div className="text-[10px] text-[var(--lg-text-muted)] leading-snug">
                  Upload a CSV or paste player names to add a private rank column
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase rounded-md bg-[var(--lg-accent)] text-white hover:opacity-90 transition-opacity"
              >
                <Upload size={12} />
                Upload CSV
              </button>
              <button
                onClick={() => setShowPaste(!showPaste)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase rounded-md border transition-colors ${
                  showPaste
                    ? 'border-[var(--lg-accent)] text-[var(--lg-accent)] bg-[var(--lg-tint)]'
                    : 'border-[var(--lg-border-subtle)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:border-[var(--lg-border-subtle)]'
                }`}
              >
                Paste
              </button>
              {rankingsCount > 0 && (
                <button
                  onClick={handleClear}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase rounded-md border border-[var(--lg-border-subtle)] text-red-400 hover:bg-red-400/10 transition-colors ml-auto"
                  title="Clear all rankings"
                >
                  <Trash2 size={12} />
                  Clear
                </button>
              )}
            </div>

            {/* Paste textarea */}
            {showPaste && (
              <div className="space-y-2">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"Shohei Ohtani,1\nAaron Judge,2\nMookie Betts,3\n\nor just names (one per line):\n\nShohei Ohtani\nAaron Judge\nMookie Betts"}
                  className="w-full h-28 px-3 py-2 text-xs rounded-md border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)] placeholder:opacity-40 outline-none focus:border-[var(--lg-accent)] resize-none font-mono"
                />
                <button
                  onClick={handlePasteImport}
                  disabled={!pasteText.trim()}
                  className="px-4 py-1.5 text-[10px] font-semibold uppercase rounded-md bg-[var(--lg-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Import
                </button>
              </div>
            )}

            {/* Import result feedback */}
            {importResult && (
              <div className="text-[10px] leading-snug space-y-1">
                {importResult.imported > 0 && (
                  <div className="text-emerald-400 font-semibold">
                    Imported {importResult.imported} player rankings
                  </div>
                )}
                {importResult.errors.length > 0 && (
                  <div className="text-[var(--lg-text-muted)] space-y-0.5">
                    {importResult.errors.slice(0, 5).map((err, i) => (
                      <div key={i} className="text-amber-400/70">{err}</div>
                    ))}
                    {importResult.errors.length > 5 && (
                      <div className="text-[var(--lg-text-muted)] opacity-50">
                        ...and {importResult.errors.length - 5} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <div className="pt-3 text-[10px] text-[var(--lg-text-muted)] opacity-40 text-center">
        Saved locally per device
      </div>
    </div>
  );
}
