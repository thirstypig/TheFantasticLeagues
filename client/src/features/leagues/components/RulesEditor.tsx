/*
 * RulesEditor — Aurora deep port.
 *
 * Renders inside an Aurora-wrapped page (Settings/Rules and Commissioner →
 * League tab). The outer page already provides AmbientBg + .aurora-theme,
 * so this component skips the wrapper and uses Aurora atoms directly:
 *
 *   - <Glass padded={false}> for the outer card
 *   - <SectionLabel> eyebrows per category section
 *   - <Chip> + <Dot> for the lock-state indicator
 *   - --am-* CSS vars for typography, borders, surface-faint inputs
 *   - --am-irid as the Save button background pill
 *
 * Business logic (rule fetch, validation guards, edit mode, lock check,
 * onSaved callback, category grouping, RULE_CONFIGS dependsOn handling) is
 * preserved 1:1 from the legacy version. The legacy variant lives in
 * git history; no /x-classic fallback is required since this component is
 * only ever rendered inside Aurora pages.
 */
import React, { useEffect, useState, useMemo } from "react";
import { Lock, Pencil } from "lucide-react";
import { useAuth } from "../../../auth/AuthProvider";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { useToast } from "../../../contexts/ToastContext";
import { Glass, SectionLabel, Chip, Dot } from "../../../components/aurora/atoms";

import overviewIcon from '../../../assets/icons/overview.svg';
import rosterIcon from '../../../assets/icons/roster.svg';
import scoringIcon from '../../../assets/icons/scoring.svg';
import draftIcon from '../../../assets/icons/draft.svg';
import ilIcon from '../../../assets/icons/il.svg';
import bonusesIcon from '../../../assets/icons/bonuses.svg';
import payoutsIcon from '../../../assets/icons/payouts.svg';

// --- Types ---
interface LeagueRule {
  id: number;
  leagueId: number;
  category: string;
  key: string;
  value: string;
  label: string;
  isLocked: boolean;
}

interface GroupedRules {
  [category: string]: LeagueRule[];
}

type RuleInputType = 'number' | 'text' | 'select' | 'slider' | 'checkbox_list' | 'json_object_counts' | 'toggle';

interface RuleConfig {
  type: RuleInputType;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  listOptions?: string[];
  suffix?: string;
  dependsOn?: { key: string; value: string };
}

// --- Constants (from centralized sportConfig) ---
import { HITTING_CATS, PITCHING_CATS, POSITIONS } from "../../../lib/sportConfig";

const RULE_CONFIGS: Record<string, RuleConfig> = {
  // team_count removed — authoritative value is League.maxTeams (edit in Commissioner → League tab).
  stats_source: { type: 'select', options: ["NL", "AL", "MLB", "Other"] },
  pitcher_count: { type: 'slider', min: 1, max: 20 },
  batter_count: { type: 'slider', min: 1, max: 25 },
  roster_positions: { type: 'json_object_counts', listOptions: POSITIONS },
  outfield_mode: { type: 'select', options: ["OF", "LF/CF/RF"] },
  dh_games_threshold: { type: 'slider', min: 1, max: 50, step: 1 },
  position_eligibility_gp: { type: 'slider', min: 1, max: 50, step: 1 },
  pitcher_split: { type: 'select', options: ["P_ONLY", "SP_RP"] },
  hitting_stats: { type: 'checkbox_list', listOptions: HITTING_CATS },
  pitching_stats: { type: 'checkbox_list', listOptions: PITCHING_CATS },
  min_innings: { type: 'select', options: ["10", "20", "30", "40", "50", "60", "70"] },
  draft_mode: { type: 'select', options: ["AUCTION", "DRAFT"] },
  draft_type: { type: 'select', options: ["SNAKE", "LINEAR"], dependsOn: { key: 'draft_mode', value: 'DRAFT' } },
  auction_budget: { type: 'number', dependsOn: { key: 'draft_mode', value: 'AUCTION' }, suffix: '$' },
  bid_timer: { type: 'select', options: ["10", "15", "30", "45", "60", "90", "120"], suffix: 's', dependsOn: { key: 'draft_mode', value: 'AUCTION' } },
  nomination_timer: { type: 'select', options: ["15", "30", "45", "60", "90", "120"], suffix: 's', dependsOn: { key: 'draft_mode', value: 'AUCTION' } },
  keeper_count: { type: 'slider', min: 0, max: 10, step: 1 },
  min_bid: { type: 'select', options: ["1", "2", "3", "4", "5"], suffix: '$' },
  grand_slam: { type: 'number', suffix: '$' },
  shutout: { type: 'number', suffix: '$' },
  cycle: { type: 'number', suffix: '$' },
  no_hitter: { type: 'number', suffix: '$' },
  perfect_game: { type: 'number', suffix: '$' },
  mvp: { type: 'number', suffix: '$' },
  cy_young: { type: 'number', suffix: '$' },
  roy: { type: 'number', suffix: '$' },
  // entry_fee removed — authoritative value is League.entryFee (edit in Commissioner → League tab).
  payout_1st: { type: 'number', suffix: '%', min: 0, max: 100 },
  payout_2nd: { type: 'number', suffix: '%', min: 0, max: 100 },
  payout_3rd: { type: 'number', suffix: '%', min: 0, max: 100 },
  payout_4th: { type: 'number', suffix: '%', min: 0, max: 100 },
  payout_5th: { type: 'number', suffix: '%', min: 0, max: 100 },
  payout_6th: { type: 'number', suffix: '%', min: 0, max: 100 },
  payout_7th: { type: 'number', suffix: '%', min: 0, max: 100 },
  payout_8th: { type: 'number', suffix: '%', min: 0, max: 100 },
  il_slot_1_cost: { type: 'number', suffix: '$' },
  il_slot_2_cost: { type: 'number', suffix: '$' },
  // Transactions — per-league toggles governing who can run roster moves.
  owner_self_serve: { type: 'toggle' },
};

const CATEGORY_ORDER = ["overview", "roster", "scoring", "draft", "il", "bonuses", "payouts", "transactions"];
const CATEGORY_ICONS: Record<string, string> = {
  overview: overviewIcon,
  roster: rosterIcon,
  scoring: scoringIcon,
  draft: draftIcon,
  il: ilIcon,
  bonuses: bonusesIcon,
  payouts: payoutsIcon,
  // transactions category uses the default emoji fallback (📄) — no icon
  // asset defined yet. Acceptable for a single-rule section; add an
  // SVG later if/when transactions grows more toggles.
};

// --- Aurora style primitives reused inside the component ---
const AURORA_BTN_BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 99,
  border: "1px solid var(--am-border)",
  cursor: "pointer",
  background: "var(--am-chip)",
  color: "var(--am-text)",
};

const AURORA_INPUT: React.CSSProperties = {
  width: "100%",
  background: "var(--am-surface-faint)",
  border: "1px solid var(--am-border)",
  borderRadius: 12,
  padding: "8px 12px",
  color: "var(--am-text)",
  outline: "none",
  fontSize: 13,
};

// --- Component ---
export function RulesEditor({ leagueId, canEdit: canEditProp, onSaved }: { leagueId: number; canEdit?: boolean; onSaved?: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rules, setRules] = useState<LeagueRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(() => {
    return rules.reduce((acc: GroupedRules, r) => {
      if (!acc[r.category]) acc[r.category] = [];
      acc[r.category].push(r);
      return acc;
    }, {});
  }, [rules]);

  const ruleMap = useMemo(() => {
    const map: Record<string, string> = {};
    rules.forEach(r => map[r.key] = pendingChanges[r.id] ?? r.value);
    return map;
  }, [rules, pendingChanges]);

  const canEdit = canEditProp ?? (user?.isAdmin || false);
  const isLocked = rules.some(r => r.isLocked);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const rulesData = await fetchJsonApi<{ rules: LeagueRule[]; grouped: GroupedRules }>(
          `${API_BASE}/leagues/${leagueId}/rules`
        );
        if (!mounted) return;
        setRules(rulesData.rules || []);
      } catch (e: unknown) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Error loading rules");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [leagueId]);

  const handleChange = (id: number, val: string) => {
    setPendingChanges(prev => ({ ...prev, [id]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = Object.entries(pendingChanges).map(([id, value]) => ({ id: Number(id), value }));
      await fetchJsonApi(`${API_BASE}/leagues/${leagueId}/rules`, {
        method: 'PUT',
        body: JSON.stringify({ updates }),
      });

      const updatedRules = rules.map(r => pendingChanges[r.id] ? { ...r, value: pendingChanges[r.id] } : r);
      setRules(updatedRules);
      setPendingChanges({});
      setEditMode(false);
      onSaved?.();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Glass>
        <div style={{ padding: 24, textAlign: "center", color: "var(--am-text-muted)", fontSize: 13 }}>
          Loading rules...
        </div>
      </Glass>
    );
  }
  if (error) {
    return (
      <Glass>
        <div style={{ padding: 24, textAlign: "center", color: "var(--am-negative)", fontSize: 13 }}>
          Error: {error}
        </div>
      </Glass>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header — title + lock chip + edit/save controls */}
      <Glass>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <SectionLabel style={{ marginBottom: 0 }}>✦ League Rules</SectionLabel>
            <h2 style={{
              fontFamily: "var(--am-display)",
              fontSize: 26,
              fontWeight: 300,
              color: "var(--am-text)",
              margin: 0,
              lineHeight: 1.1,
              letterSpacing: -0.2,
            }}>
              {isLocked ? "Locked for the season." : "View and edit league settings."}
            </h2>
            <div style={{ display: "inline-flex", gap: 8, marginTop: 4 }}>
              {isLocked ? (
                <Chip color="var(--am-text)" style={{ background: "var(--am-chip-strong)" }}>
                  <Dot color="var(--am-cardinal)" />
                  Rules locked
                </Chip>
              ) : (
                <Chip color="var(--am-text-muted)">
                  <Dot color="var(--am-accent)" />
                  Editable
                </Chip>
              )}
            </div>
          </div>

          {canEdit && !isLocked && (
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {editMode ? (
                <>
                  <button
                    type="button"
                    style={AURORA_BTN_BASE}
                    onClick={() => { setEditMode(false); setPendingChanges({}); }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      ...AURORA_BTN_BASE,
                      background: "var(--am-irid)",
                      border: "1px solid var(--am-border-strong)",
                      color: "#fff",
                      opacity: saving ? 0.6 : 1,
                      boxShadow: "0 6px 20px rgba(255,80,80,0.18)",
                    }}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  style={{
                    ...AURORA_BTN_BASE,
                    background: "var(--am-irid)",
                    border: "1px solid var(--am-border-strong)",
                    color: "#fff",
                    boxShadow: "0 6px 20px rgba(255,80,80,0.18)",
                  }}
                >
                  <Pencil size={12} />
                  Edit Rules
                </button>
              )}
            </div>
          )}
          {isLocked && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--am-text-faint)" }}>
              <Lock size={12} />
              Read-only
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 12,
            background: "var(--am-surface-faint)",
            border: "1px solid var(--am-border)",
            fontSize: 11,
            color: "var(--am-text-muted)",
            lineHeight: 1.5,
          }}
        >
          Waiver, trade, playoff, and discovery settings (max teams, entry fee, FAAB budget, trade deadline, roster lock) live in the other Commissioner tabs — they write directly to the League model. See <span style={{ fontFamily: "var(--am-mono, monospace)", color: "var(--am-text)" }}>docs/RULES_AUDIT.md</span> for the full map.
        </div>
      </Glass>

      {/* Category sections */}
      {CATEGORY_ORDER.map(cat => {
        const catRules = grouped[cat];
        if (!catRules) return null;

        return (
          <Glass key={cat} padded={false}>
            <div style={{ padding: "18px 22px 8px", borderBottom: "1px solid var(--am-border)", display: "flex", alignItems: "center", gap: 12 }}>
              {CATEGORY_ICONS[cat] ? (
                <img
                  src={CATEGORY_ICONS[cat]}
                  alt={cat}
                  style={{ width: 22, height: 22, opacity: 0.75, filter: 'brightness(0) invert(1) opacity(0.75)' }}
                />
              ) : (
                <span style={{ fontSize: 18 }}>📄</span>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <SectionLabel style={{ marginBottom: 0 }}>✦ {cat.replace('_', ' ')}</SectionLabel>
                <span style={{
                  fontFamily: "var(--am-display)",
                  fontSize: 18,
                  fontWeight: 400,
                  color: "var(--am-text)",
                  textTransform: "capitalize",
                  letterSpacing: -0.1,
                }}>
                  {cat.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div
              style={{
                padding: 22,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "20px 32px",
              }}
            >
              {catRules.map(rule => {
                const config = RULE_CONFIGS[rule.key] || { type: 'text' };

                if (config.dependsOn) {
                  const depVal = ruleMap[config.dependsOn.key];
                  if (depVal !== config.dependsOn.value) return null;
                }

                const val = pendingChanges[rule.id] ?? rule.value;
                const isEditing = editMode && !isLocked;

                return (
                  <div
                    key={rule.id}
                    style={{
                      padding: 14,
                      background: "var(--am-surface-faint)",
                      border: "1px solid var(--am-border)",
                      borderRadius: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      opacity: isLocked ? 0.6 : 1,
                    }}
                  >
                    <label style={{
                      display: "block",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                      color: "var(--am-text-faint)",
                    }}>
                      {rule.label}
                    </label>
                    <div>
                      {RenderInput(rule, val, config, isEditing, (v) => handleChange(rule.id, v))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Glass>
        );
      })}
    </div>
  );
}

// Helper to render inputs
function RenderInput(rule: LeagueRule, val: string, config: RuleConfig, editing: boolean, onChange: (v: string) => void) {
  if (!editing) {
    if (config.type === 'checkbox_list' || config.type === 'json_object_counts') {
      try {
        const obj = JSON.parse(val);
        if (Array.isArray(obj)) return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {obj.map(item => (
              <span
                key={item}
                style={{
                  padding: "4px 10px",
                  borderRadius: 99,
                  background: "var(--am-chip)",
                  border: "1px solid var(--am-border)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--am-text)",
                }}
              >
                {item}
              </span>
            ))}
          </div>
        );
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(obj).map(([k, v]) => (
              <span
                key={k}
                style={{
                  padding: "4px 10px",
                  borderRadius: 99,
                  background: "var(--am-chip)",
                  border: "1px solid var(--am-border)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--am-text)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--am-text-faint)" }}>{k}</span>
                {String(v)}
              </span>
            ))}
          </div>
        );
      } catch {
        return <span style={{ fontSize: 14, fontWeight: 600, color: "var(--am-text)" }}>{val}</span>;
      }
    }
    return (
      <div style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontFamily: "var(--am-display)", fontSize: 22, fontWeight: 400, color: "var(--am-text)", letterSpacing: -0.3, fontVariantNumeric: "tabular-nums" }}>
          {val}
        </span>
        {config.suffix && (
          <span style={{ fontSize: 13, color: "var(--am-accent)", fontWeight: 500 }}>{config.suffix}</span>
        )}
      </div>
    );
  }

  if (config.type === 'select') {
    return (
      <select
        value={val}
        onChange={e => onChange(e.target.value)}
        style={AURORA_INPUT}
      >
        {config.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }

  if (config.type === 'slider') {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          type="range"
          min={config.min}
          max={config.max}
          step={config.step ?? 1}
          value={val}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1, accentColor: "var(--am-accent)", cursor: "pointer" }}
        />
        <span style={{ width: 32, textAlign: "right", fontFamily: "var(--am-mono, monospace)", color: "var(--am-text)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
          {val}
        </span>
      </div>
    );
  }

  if (config.type === 'number') {
    return (
      <div style={{ position: "relative" }}>
        <input
          type="number"
          min={config.min}
          max={config.max}
          value={val}
          onChange={e => onChange(e.target.value)}
          style={{ ...AURORA_INPUT, paddingRight: config.suffix ? 28 : 12 }}
        />
        {config.suffix && (
          <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--am-text-faint)", fontSize: 12 }}>
            {config.suffix}
          </span>
        )}
      </div>
    );
  }

  if (config.type === 'checkbox_list') {
    let current: string[] = [];
    try { current = JSON.parse(val); } catch { /* ignore */ }
    if (!Array.isArray(current)) current = [];

    const toggle = (item: string) => {
      const next = current.includes(item) ? current.filter(x => x !== item) : [...current, item];
      onChange(JSON.stringify(next));
    };

    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {config.listOptions?.map(opt => {
          const active = current.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              type="button"
              style={{
                padding: "4px 10px",
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                background: active ? "var(--am-irid)" : "var(--am-surface-faint)",
                border: `1px solid ${active ? "var(--am-border-strong)" : "var(--am-border)"}`,
                color: active ? "#fff" : "var(--am-text-muted)",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  if (config.type === 'json_object_counts') {
    let current: Record<string, number> = {};
    try { current = JSON.parse(val); } catch { /* ignore */ }

    const updateCount = (key: string, count: number) => {
      const next = { ...current, [key]: count };
      if (count === 0) delete next[key];
      onChange(JSON.stringify(next));
    };

    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(60px, 1fr))", gap: 6 }}>
        {config.listOptions?.map(opt => (
          <div
            key={opt}
            style={{
              background: "var(--am-chip)",
              border: "1px solid var(--am-border)",
              borderRadius: 10,
              padding: 6,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--am-text-faint)" }}>{opt}</span>
            <input
              type="number"
              min="0"
              value={current[opt] || 0}
              onChange={e => updateCount(opt, Number(e.target.value))}
              style={{
                width: "100%",
                background: "var(--am-surface-faint)",
                color: "var(--am-text)",
                fontSize: 13,
                textAlign: "center",
                border: "1px solid var(--am-border)",
                borderRadius: 6,
                padding: "2px 4px",
                outline: "none",
                fontVariantNumeric: "tabular-nums",
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <input
      type="text"
      value={val}
      onChange={e => onChange(e.target.value)}
      style={AURORA_INPUT}
    />
  );
}
