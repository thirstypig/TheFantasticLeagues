import { useState, useEffect } from "react";
import { GripVertical, Trash2, Plus, AlertCircle } from "lucide-react";
import { useParams } from "react-router-dom";
import { fetchJsonApi, ApiError } from "../../../api/base";

interface ScoringRule {
  id?: number;
  statKey: string;
  label: string;
  pointValue: number;
  isActive: boolean;
  sortOrder: number;
  isCustom?: boolean;
}

interface RosterSlot {
  slot: string;
  count: number;
}

interface ScoringSettingsResponse {
  leagueId: number;
  sport: "NFL" | "NBA";
  rules: ScoringRule[];
}

interface RosterConfigResponse {
  leagueId: number;
  slots: Record<string, number>;
}

interface SaveScoringSettingsRequest {
  rules: ScoringRule[];
}

interface SaveRosterConfigRequest {
  slots: Record<string, number>;
}

export function ScoringSettings() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [activeTab, setActiveTab] = useState<"rules" | "roster">("rules");
  const [sport, setSport] = useState<"NFL" | "NBA">("NFL");

  // Scoring Rules state
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [rulesChanged, setRulesChanged] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  // Roster Config state
  const [rosterSlots, setRosterSlots] = useState<Record<string, number>>({});
  const [rosterChanged, setRosterChanged] = useState(false);
  const [rosterSaving, setRosterSaving] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  // Loading state
  const [loading, setLoading] = useState(true);

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      if (!leagueId) return;

      try {
        setLoading(true);

        // Fetch scoring settings
        const settingsResp = await fetchJsonApi(
          `GET /api/leagues/${leagueId}/scoring-settings`
        ) as ScoringSettingsResponse;
        setRules(settingsResp.rules);
        setSport(settingsResp.sport);

        // Fetch roster config
        const rosterResp = await fetchJsonApi(
          `GET /api/leagues/${leagueId}/roster-config`
        ) as RosterConfigResponse;
        setRosterSlots(rosterResp.slots);

        setRulesError(null);
        setRosterError(null);
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? `${err.status}: ${err.serverMessage || err.detail}`
            : "Failed to load settings";
        setRulesError(msg);
        setRosterError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [leagueId]);

  // Save scoring rules
  const saveRules = async () => {
    if (!leagueId || !rulesChanged) return;

    try {
      setRulesSaving(true);
      setRulesError(null);

      const payload: SaveScoringSettingsRequest = { rules };
      await fetchJsonApi(`PATCH /api/leagues/${leagueId}/scoring-settings`, {
        body: JSON.stringify(payload),
      } as RequestInit);

      setRulesChanged(false);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.status}: ${err.serverMessage || err.detail}`
          : "Failed to save rules";
      setRulesError(msg);
    } finally {
      setRulesSaving(false);
    }
  };

  // Save roster config
  const saveRoster = async () => {
    if (!leagueId || !rosterChanged) return;

    try {
      setRosterSaving(true);
      setRosterError(null);

      const payload: SaveRosterConfigRequest = { slots: rosterSlots };
      await fetchJsonApi(`PATCH /api/leagues/${leagueId}/roster-config`, {
        body: JSON.stringify(payload),
      } as RequestInit);

      setRosterChanged(false);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.status}: ${err.serverMessage || err.detail}`
          : "Failed to save roster config";
      setRosterError(msg);
    } finally {
      setRosterSaving(false);
    }
  };

  const handleRuleChange = (
    idx: number,
    field: keyof ScoringRule,
    value: any
  ) => {
    const updated = [...rules];
    updated[idx] = { ...updated[idx], [field]: value };
    setRules(updated);
    setRulesChanged(true);
  };

  const handleSlotChange = (slot: string, delta: number) => {
    const newCount = Math.max(0, (rosterSlots[slot] ?? 0) + delta);
    setRosterSlots({ ...rosterSlots, [slot]: newCount });
    setRosterChanged(true);
  };

  const totalSlots = Object.values(rosterSlots).reduce((sum, count) => sum + count, 0);

  if (loading) {
    return (
      <div className="aurora-theme min-h-screen" style={{ "--am-accent": "#0891b2" } as React.CSSProperties}>
        <div className="border-b border-[var(--am-border)]">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <h1 className="text-2xl font-semibold text-[var(--am-text-primary)]">Scoring Settings</h1>
            <p className="text-sm text-[var(--am-text-muted)]">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="aurora-theme min-h-screen"
      style={{ "--am-accent": "#0891b2" } as React.CSSProperties}
    >
      {/* Page Header */}
      <div className="border-b border-[var(--am-border)]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold text-[var(--am-text-primary)]">
              Scoring Settings
            </h1>
            <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-[var(--am-accent)] text-white">
              {sport}
            </span>
          </div>
          <p className="text-sm text-[var(--am-text-muted)]">
            Configure scoring rules and roster slots for {sport} leagues
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="border-b border-[var(--am-border)] mb-6 flex gap-8">
          <button
            onClick={() => setActiveTab("rules")}
            className={`pb-3 font-medium text-sm transition border-b-2 ${
              activeTab === "rules"
                ? "border-[var(--am-accent)] text-[var(--am-accent)]"
                : "border-transparent text-[var(--am-text-muted)] hover:text-[var(--am-text-primary)]"
            }`}
          >
            Scoring Rules
          </button>
          <button
            onClick={() => setActiveTab("roster")}
            className={`pb-3 font-medium text-sm transition border-b-2 ${
              activeTab === "roster"
                ? "border-[var(--am-accent)] text-[var(--am-accent)]"
                : "border-transparent text-[var(--am-text-muted)] hover:text-[var(--am-text-primary)]"
            }`}
          >
            Roster Config
          </button>
        </div>

        {/* TAB 1: Scoring Rules */}
        {activeTab === "rules" && (
          <div className="space-y-6">
            {/* Unsaved changes indicator */}
            {rulesChanged && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 text-yellow-900">
                <div className="w-2 h-2 rounded-full bg-yellow-600" />
                <span className="text-sm font-medium">Unsaved changes</span>
              </div>
            )}

            {/* Error message */}
            {rulesError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-900">
                <AlertCircle size={16} />
                <span className="text-sm">{rulesError}</span>
              </div>
            )}

            {/* Card Container */}
            <div
              className="rounded-xl border border-[var(--am-border)] overflow-hidden"
              style={{
                background: "var(--am-surface)",
              }}
            >
              {sport === "NFL" ? (
                <>
                  {/* NFL Rules Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[var(--am-border)] bg-[var(--am-bg-secondary)]">
                          <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--am-text-muted)] uppercase tracking-wide">
                            Stat
                          </th>
                          <th className="px-6 py-4 text-right text-xs font-semibold text-[var(--am-text-muted)] uppercase tracking-wide">
                            Points
                          </th>
                          <th className="px-6 py-4 text-center text-xs font-semibold text-[var(--am-text-muted)] uppercase tracking-wide">
                            Active
                          </th>
                          <th className="px-6 py-4 text-right text-xs font-semibold text-[var(--am-text-muted)] uppercase tracking-wide">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rules.map((rule, idx) => (
                          <tr
                            key={rule.id || idx}
                            className="border-b border-[var(--am-border)] hover:bg-[var(--am-bg-tertiary)] transition"
                          >
                            <td className="px-6 py-4 text-sm text-[var(--am-text-primary)] font-medium">
                              {rule.label}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <input
                                type="number"
                                value={rule.pointValue}
                                step="0.01"
                                className="w-20 px-2 py-1 text-sm text-right rounded border border-[var(--am-border)] bg-[var(--am-bg-primary)] text-[var(--am-text-primary)] font-mono"
                                style={{ fontVariantNumeric: "tabular-nums" }}
                                onChange={(e) =>
                                  handleRuleChange(
                                    idx,
                                    "pointValue",
                                    parseFloat(e.target.value)
                                  )
                                }
                              />
                            </td>
                            <td className="px-6 py-4 text-center">
                              <input
                                type="checkbox"
                                checked={rule.isActive}
                                className="w-5 h-5 rounded"
                                onChange={(e) =>
                                  handleRuleChange(idx, "isActive", e.target.checked)
                                }
                              />
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button className="p-2 hover:bg-red-100 rounded text-red-600 transition">
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Action Buttons */}
                  <div className="px-6 py-4 border-t border-[var(--am-border)] bg-[var(--am-bg-secondary)] flex gap-4">
                    <button className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--am-text-muted)] hover:text-[var(--am-accent)] transition">
                      <Plus size={16} />
                      Add Custom Rule
                    </button>
                    <button
                      disabled={!rulesChanged || rulesSaving}
                      onClick={saveRules}
                      className="ml-auto px-6 py-2 text-sm font-medium text-white rounded-lg bg-[var(--am-accent)] hover:opacity-90 disabled:opacity-50 transition"
                    >
                      {rulesSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* NBA Categories List */}
                  <div className="divide-y divide-[var(--am-border)]">
                    {rules.map((cat, idx) => (
                      <div
                        key={cat.id || idx}
                        className="px-6 py-4 flex items-center gap-4 hover:bg-[var(--am-bg-tertiary)] transition group"
                      >
                        <div className="opacity-0 group-hover:opacity-100 transition text-[var(--am-text-muted)]">
                          <GripVertical size={18} />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-[var(--am-text-primary)]">
                            {cat.label}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={cat.isActive}
                          className="w-5 h-5 rounded"
                          onChange={(e) =>
                            handleRuleChange(idx, "isActive", e.target.checked)
                          }
                        />
                        <button className="p-2 hover:bg-red-100 rounded text-red-600 transition opacity-0 group-hover:opacity-100">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Action Buttons */}
                  <div className="px-6 py-4 border-t border-[var(--am-border)] bg-[var(--am-bg-secondary)] flex gap-4">
                    <button className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--am-text-muted)] hover:text-[var(--am-accent)] transition">
                      <Plus size={16} />
                      Add Category
                    </button>
                    <button
                      disabled={!rulesChanged || rulesSaving}
                      onClick={saveRules}
                      className="ml-auto px-6 py-2 text-sm font-medium text-white rounded-lg bg-[var(--am-accent)] hover:opacity-90 disabled:opacity-50 transition"
                    >
                      {rulesSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Roster Config */}
        {activeTab === "roster" && (
          <div className="space-y-6">
            {/* Unsaved changes indicator */}
            {rosterChanged && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 text-yellow-900">
                <div className="w-2 h-2 rounded-full bg-yellow-600" />
                <span className="text-sm font-medium">Unsaved changes</span>
              </div>
            )}

            {/* Error message */}
            {rosterError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-900">
                <AlertCircle size={16} />
                <span className="text-sm">{rosterError}</span>
              </div>
            )}

            {/* Card Container */}
            <div
              className="rounded-xl border border-[var(--am-border)] overflow-hidden"
              style={{
                background: "var(--am-surface)",
              }}
            >
              <div className="p-6">
                <h3 className="font-semibold text-[var(--am-text-primary)] mb-6">
                  {sport} Roster Slots
                </h3>

                {/* Slots Grid */}
                <div className="space-y-3 mb-6">
                  {Object.entries(rosterSlots).map(([slot, count]) => (
                    <div
                      key={slot}
                      className="flex items-center justify-between p-4 rounded-lg bg-[var(--am-bg-secondary)] border border-[var(--am-border)]"
                    >
                      <span className="font-medium text-[var(--am-text-primary)] min-w-12">
                        {slot}
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleSlotChange(slot, -1)}
                          className="px-2 py-1 rounded hover:bg-[var(--am-bg-tertiary)] text-[var(--am-text-muted)]"
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-mono text-sm font-semibold">
                          {count}
                        </span>
                        <button
                          onClick={() => handleSlotChange(slot, 1)}
                          className="px-2 py-1 rounded hover:bg-[var(--am-bg-tertiary)] text-[var(--am-text-muted)]"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total Display */}
                <div className="p-4 rounded-lg bg-[var(--am-accent)] bg-opacity-10 border border-[var(--am-accent)] border-opacity-30 mb-6">
                  <p className="text-sm text-[var(--am-text-muted)]">
                    Total Roster Spots
                  </p>
                  <p className="text-2xl font-bold text-[var(--am-accent)]">
                    {totalSlots}
                  </p>
                </div>

                {/* Save Button */}
                <button
                  disabled={!rosterChanged || rosterSaving}
                  onClick={saveRoster}
                  className="w-full px-6 py-3 text-sm font-medium text-white rounded-lg bg-[var(--am-accent)] hover:opacity-90 disabled:opacity-50 transition"
                >
                  {rosterSaving ? "Saving..." : "Save Roster Config"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
