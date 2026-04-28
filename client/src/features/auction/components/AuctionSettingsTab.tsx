/*
 * AuctionSettingsTab — Aurora port (PR-3 of Auction module rollout).
 *
 * Personal preferences panel inside the live-auction sidebar. Renders
 * toggle rows (sound, notifications, chat, watchlist, opening-bid picker,
 * value column, spending pace), a default-league filter segmented control,
 * and a rankings import affordance (CSV upload + paste).
 *
 * Outer chrome moves to Aurora atoms (Glass, SectionLabel, Chip-style
 * pill buttons). Toggles use Aurora --am-* tokens for on/off states.
 * 100% of business logic preserved: hooks, callbacks, ranking parser,
 * preference keys/types, and Lucide icons remain untouched.
 */
import React, { useState, useRef } from 'react';
import { Volume2, Bell, MessageCircle, Star, DollarSign, TrendingUp, BarChart3, Globe, Upload, FileText, Trash2 } from 'lucide-react';
import type { AuctionPrefs, LeagueFilter } from '../hooks/useAuctionPrefs';
import { Glass, SectionLabel } from '../../../components/aurora/atoms';

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

const ROW_BASE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: 12,
  borderRadius: 12,
  background: "var(--am-surface-faint)",
  border: "1px solid var(--am-border)",
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
  transition: "background 160ms",
};

const PILL_BTN_BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  borderRadius: 99,
  cursor: "pointer",
  transition: "background 160ms, border-color 160ms, color 160ms",
};

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
    <div className="h-full overflow-y-auto">
      <Glass padded={false}>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <SectionLabel>Personal Preferences</SectionLabel>

          {/* Toggle settings */}
          {TOGGLE_SETTINGS.map(s => {
            const on = !!prefs[s.key];
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onToggle(s.key)}
                style={ROW_BASE}
              >
                <s.icon
                  size={16}
                  style={{
                    color: on ? "var(--am-accent)" : "var(--am-text-faint)",
                    opacity: on ? 1 : 0.5,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--am-text)" }}>{s.label}</div>
                  <div style={{ fontSize: 10, color: "var(--am-text-muted)", lineHeight: 1.35, marginTop: 2 }}>{s.desc}</div>
                </div>
                <div
                  aria-hidden
                  style={{
                    width: 32,
                    height: 18,
                    borderRadius: 99,
                    padding: 2,
                    background: on ? "var(--am-accent)" : "var(--am-chip)",
                    border: "1px solid var(--am-border)",
                    flexShrink: 0,
                    transition: "background 160ms",
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 99,
                      background: "#fff",
                      transform: on ? "translateX(14px)" : "translateX(0)",
                      transition: "transform 160ms",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
                    }}
                  />
                </div>
              </button>
            );
          })}

          {/* Default league filter */}
          <div style={{ ...ROW_BASE, cursor: "default" }}>
            <Globe size={16} style={{ color: "var(--am-accent)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--am-text)" }}>Default League Filter</div>
              <div style={{ fontSize: 10, color: "var(--am-text-muted)", lineHeight: 1.35, marginTop: 2 }}>Set your default Player Pool filter</div>
            </div>
            <div
              style={{
                display: "flex",
                background: "var(--am-chip)",
                borderRadius: 8,
                padding: 2,
                border: "1px solid var(--am-border)",
                flexShrink: 0,
              }}
            >
              {(['ALL', 'NL', 'AL'] as LeagueFilter[]).map(f => {
                const active = prefs.defaultLeagueFilter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onUpdate('defaultLeagueFilter', f)}
                    style={{
                      padding: "4px 10px",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      borderRadius: 6,
                      background: active ? "var(--am-accent)" : "transparent",
                      color: active ? "#fff" : "var(--am-text-muted)",
                      border: "none",
                      cursor: "pointer",
                      transition: "background 160ms, color 160ms",
                    }}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>

          {/* My Rankings section */}
          {onImportRankings && (
            <>
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 12,
                  borderTop: "1px solid var(--am-border)",
                }}
              >
                <SectionLabel>My Rankings</SectionLabel>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: "var(--am-surface-faint)",
                  border: "1px solid var(--am-border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {/* Current status */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <FileText
                    size={16}
                    style={{
                      color: rankingsCount > 0 ? "var(--am-accent)" : "var(--am-text-faint)",
                      opacity: rankingsCount > 0 ? 1 : 0.5,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--am-text)" }}>
                      {rankingsCount > 0 ? `${rankingsCount} players ranked` : 'No rankings imported'}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--am-text-muted)", lineHeight: 1.35, marginTop: 2 }}>
                      Upload a CSV or paste player names to add a private rank column
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      ...PILL_BTN_BASE,
                      background: "var(--am-accent)",
                      color: "#fff",
                      border: "1px solid var(--am-accent)",
                    }}
                  >
                    <Upload size={12} />
                    Upload CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPaste(!showPaste)}
                    style={{
                      ...PILL_BTN_BASE,
                      background: showPaste ? "var(--am-chip-strong)" : "var(--am-chip)",
                      color: showPaste ? "var(--am-text)" : "var(--am-text-muted)",
                      border: `1px solid ${showPaste ? "var(--am-border-strong)" : "var(--am-border)"}`,
                    }}
                  >
                    Paste
                  </button>
                  {rankingsCount > 0 && (
                    <button
                      type="button"
                      onClick={handleClear}
                      title="Clear all rankings"
                      style={{
                        ...PILL_BTN_BASE,
                        background: "var(--am-chip)",
                        color: "rgb(248, 113, 113)",
                        border: "1px solid var(--am-border)",
                        marginLeft: "auto",
                      }}
                    >
                      <Trash2 size={12} />
                      Clear
                    </button>
                  )}
                </div>

                {/* Paste textarea */}
                {showPaste && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <textarea
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder={"Shohei Ohtani,1\nAaron Judge,2\nMookie Betts,3\n\nor just names (one per line):\n\nShohei Ohtani\nAaron Judge\nMookie Betts"}
                      style={{
                        width: "100%",
                        height: 112,
                        padding: "8px 12px",
                        fontSize: 12,
                        borderRadius: 8,
                        background: "var(--am-surface-faint)",
                        color: "var(--am-text)",
                        border: "1px solid var(--am-border)",
                        outline: "none",
                        resize: "none",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        transition: "border-color 160ms, box-shadow 160ms",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--am-accent)";
                        e.currentTarget.style.boxShadow = "0 0 0 1px var(--am-accent)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "var(--am-border)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                    <button
                      type="button"
                      onClick={handlePasteImport}
                      disabled={!pasteText.trim()}
                      style={{
                        ...PILL_BTN_BASE,
                        alignSelf: "flex-start",
                        padding: "6px 14px",
                        background: "var(--am-accent)",
                        color: "#fff",
                        border: "1px solid var(--am-accent)",
                        opacity: !pasteText.trim() ? 0.3 : 1,
                        cursor: !pasteText.trim() ? "not-allowed" : "pointer",
                      }}
                    >
                      Import
                    </button>
                  </div>
                )}

                {/* Import result feedback */}
                {importResult && (
                  <div style={{ fontSize: 10, lineHeight: 1.4, display: "flex", flexDirection: "column", gap: 4 }}>
                    {importResult.imported > 0 && (
                      <div style={{ color: "rgb(52, 211, 153)", fontWeight: 600 }}>
                        Imported {importResult.imported} player rankings
                      </div>
                    )}
                    {importResult.errors.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {importResult.errors.slice(0, 5).map((err, i) => (
                          <div key={i} style={{ color: "rgba(251, 191, 36, 0.7)" }}>{err}</div>
                        ))}
                        {importResult.errors.length > 5 && (
                          <div style={{ color: "var(--am-text-faint)", opacity: 0.6 }}>
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

          <div
            style={{
              paddingTop: 12,
              fontSize: 10,
              color: "var(--am-text-faint)",
              opacity: 0.6,
              textAlign: "center",
            }}
          >
            Saved locally per device
          </div>
        </div>
      </Glass>
    </div>
  );
}
