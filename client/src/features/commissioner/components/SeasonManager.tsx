/*
 * SeasonManager — Aurora deep port.
 *
 * Renders the season-lifecycle manager (SETUP → DRAFT → IN_SEASON →
 * COMPLETED transitions, period CRUD, season locking) inside the
 * Commissioner page's Season tab. Business logic — status transitions,
 * confirmations, validation, idempotency, useToast — is preserved 1:1
 * from the legacy implementation. Only chrome moves to Aurora atoms.
 *
 * Outer surfaces become `<Glass>` cards. Phase indicator becomes a
 * tinted `<Chip strong>`. Phase advance CTA is an iridescent pill;
 * secondary actions are chip-pill buttons. Inputs use `am-surface-faint`
 * + `am-border` with accent focus. Destructive period delete uses
 * `var(--am-negative)`.
 */
import React, { useEffect, useState, type CSSProperties } from "react";
import { Check, Trash2 } from "lucide-react";
import {
  getSeasons,
  getCurrentSeason,
  transitionSeason,
  createPeriod,
  updatePeriod,
  deletePeriod,
  type Season,
  type SeasonStatus,
} from "../../seasons/api";
import { getLeagues, type LeagueListItem } from "../../../api";
import { createLeagueSeason } from "../api";
import { useToast } from "../../../contexts/ToastContext";
import { Glass, Chip, SectionLabel } from "../../../components/aurora/atoms";

const STATUS_STEPS: SeasonStatus[] = ["SETUP", "DRAFT", "IN_SEASON", "COMPLETED"];
const STATUS_LABELS_BASE: Record<SeasonStatus, string> = {
  SETUP: "Setup",
  DRAFT: "Draft",
  IN_SEASON: "In Season",
  COMPLETED: "Completed",
};

// Phase-tinted chip palette. SETUP=blue, DRAFT=amber, IN_SEASON=positive,
// COMPLETED=muted. Tints are translucent so they ride the Glass tone.
const PHASE_TINT: Record<SeasonStatus, { bg: string; border: string; text: string }> = {
  SETUP: { bg: "rgba(59, 130, 246, 0.12)", border: "rgba(59, 130, 246, 0.32)", text: "rgb(96, 165, 250)" },
  DRAFT: { bg: "rgba(245, 158, 11, 0.14)", border: "rgba(245, 158, 11, 0.32)", text: "rgb(251, 191, 36)" },
  IN_SEASON: { bg: "rgba(16, 185, 129, 0.12)", border: "rgba(16, 185, 129, 0.32)", text: "rgb(52, 211, 153)" },
  COMPLETED: { bg: "var(--am-chip)", border: "var(--am-border)", text: "var(--am-text-muted)" },
};

const NEXT_STATUS: Record<string, SeasonStatus> = {
  SETUP: "DRAFT",
  DRAFT: "IN_SEASON",
  IN_SEASON: "COMPLETED",
};

const TRANSITION_WARNINGS: Record<string, string> = {
  DRAFT: "This will lock all league rules. Rules cannot be changed after this point. Are you sure?",
  IN_SEASON: "This will start the season. Make sure all periods are configured. Continue?",
  COMPLETED: "This will mark the season as completed. All periods must be completed first. Continue?",
};

// ─── Aurora chrome helpers ───
const SECTION_HEADING: CSSProperties = {
  fontFamily: "var(--am-display)",
  fontSize: 18,
  fontWeight: 400,
  color: "var(--am-text)",
  margin: 0,
  letterSpacing: -0.2,
};

const INPUT_STYLE: CSSProperties = {
  width: "100%",
  background: "var(--am-surface-faint)",
  border: "1px solid var(--am-border)",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 13,
  color: "var(--am-text)",
  outline: "none",
};

const LABEL_STYLE: CSSProperties = {
  display: "block",
  fontSize: 10,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "var(--am-text-faint)",
  fontWeight: 600,
  marginBottom: 6,
};

const CHIP_BTN: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 99,
  background: "var(--am-chip)",
  color: "var(--am-text)",
  border: "1px solid var(--am-border)",
  cursor: "pointer",
};

const IRIDESCENT_PILL: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 99,
  background: "var(--am-irid)",
  color: "#fff",
  border: "1px solid var(--am-border-strong)",
  cursor: "pointer",
  boxShadow: "0 6px 20px rgba(255,80,80,0.22)",
};

interface Props {
  leagueId: number;
  draftMode?: "AUCTION" | "DRAFT";
}

export default function SeasonManager({ leagueId, draftMode }: Props) {
  const { confirm, toast } = useToast();
  const STATUS_LABELS = { ...STATUS_LABELS_BASE, DRAFT: draftMode === "AUCTION" ? "Auction Draft" : "Draft" };
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create new league/season form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [allLeagues, setAllLeagues] = useState<LeagueListItem[]>([]);
  const [newLeagueName, setNewLeagueName] = useState("");
  const [newLeagueYear, setNewLeagueYear] = useState(new Date().getFullYear() + 1);
  const [newDraftMode, setNewDraftMode] = useState<"AUCTION" | "DRAFT">("AUCTION");
  const [copyFromId, setCopyFromId] = useState<number | null>(null);

  // Create period form
  const [showPeriodForm, setShowPeriodForm] = useState(false);
  const [periodName, setPeriodName] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  // Edit period form
  const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [allSeasons, current, leaguesResp] = await Promise.all([
        getSeasons(leagueId),
        getCurrentSeason(leagueId),
        getLeagues(),
      ]);
      setSeasons(allSeasons);
      setCurrentSeason(current);
      const sorted = [...(leaguesResp.leagues ?? [])].sort((a, b) => b.season - a.season);
      setAllLeagues(sorted);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load seasons");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [leagueId]);

  async function onTransition(seasonId: number, nextStatus: SeasonStatus) {
    const warning = TRANSITION_WARNINGS[nextStatus];
    if (warning && !await confirm(warning)) return;

    setBusy(true);
    setError(null);
    try {
      await transitionSeason(seasonId, nextStatus);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transition failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCreatePeriod() {
    if (!currentSeason) return;
    setBusy(true);
    setError(null);
    try {
      await createPeriod({
        leagueId,
        seasonId: currentSeason.id,
        name: periodName,
        startDate: periodStart,
        endDate: periodEnd,
      });
      setPeriodName("");
      setPeriodStart("");
      setPeriodEnd("");
      setShowPeriodForm(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create period");
    } finally {
      setBusy(false);
    }
  }

  async function onDeletePeriod(periodId: number) {
    if (!await confirm("Delete this period?")) return;
    setBusy(true);
    try {
      await deletePeriod(periodId);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete period");
    } finally {
      setBusy(false);
    }
  }

  async function onUpdatePeriodStatus(periodId: number, status: string) {
    setBusy(true);
    try {
      await updatePeriod(periodId, { status });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update period");
    } finally {
      setBusy(false);
    }
  }

  function startEditPeriod(p: { id: number; name: string; startDate: string; endDate: string }) {
    setEditingPeriodId(p.id);
    setEditName(p.name);
    // Convert ISO datetime to YYYY-MM-DD for date input
    setEditStart(new Date(p.startDate).toISOString().slice(0, 10));
    setEditEnd(new Date(p.endDate).toISOString().slice(0, 10));
  }

  async function onSaveEditPeriod() {
    if (!editingPeriodId || !editName || !editStart || !editEnd) return;
    if (new Date(editEnd) <= new Date(editStart)) {
      toast("End date must be after start date", "error");
      return;
    }
    setBusy(true);
    try {
      await updatePeriod(editingPeriodId, { name: editName, startDate: editStart, endDate: editEnd });
      setEditingPeriodId(null);
      await load();
      toast("Period updated", "success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update period");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Glass>
        <div style={{ textAlign: "center", padding: "16px 8px", fontSize: 13, color: "var(--am-text-muted)" }}>
          Loading seasons…
        </div>
      </Glass>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && (
        <div
          style={{
            borderRadius: 14,
            border: "1px solid rgba(220, 38, 38, 0.32)",
            background: "rgba(220, 38, 38, 0.10)",
            padding: "10px 14px",
            fontSize: 13,
            color: "rgb(248, 113, 113)",
          }}
        >
          {error}
        </div>
      )}

      {/* Current Season or Create */}
      {currentSeason ? (
        <Glass padded={false}>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <SectionLabel>Current Season</SectionLabel>
                <h3 style={SECTION_HEADING}>{currentSeason.year} Season</h3>
                <span>
                  <Chip
                    strong
                    color={PHASE_TINT[currentSeason.status].text}
                    style={{
                      background: PHASE_TINT[currentSeason.status].bg,
                      borderColor: PHASE_TINT[currentSeason.status].border,
                      fontWeight: 600,
                    }}
                  >
                    {STATUS_LABELS[currentSeason.status]}
                  </Chip>
                </span>
              </div>

              {NEXT_STATUS[currentSeason.status] && (
                <button
                  type="button"
                  onClick={() => onTransition(currentSeason.id, NEXT_STATUS[currentSeason.status])}
                  disabled={busy}
                  style={{
                    ...IRIDESCENT_PILL,
                    opacity: busy ? 0.5 : 1,
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  Advance to {STATUS_LABELS[NEXT_STATUS[currentSeason.status]]}
                </button>
              )}
            </div>

            {/* Status Stepper */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {STATUS_STEPS.map((step, idx) => {
                const stepIdx = STATUS_STEPS.indexOf(step);
                const currentIdx = STATUS_STEPS.indexOf(currentSeason.status);
                const isComplete = stepIdx < currentIdx;
                const isCurrent = stepIdx === currentIdx;

                return (
                  <React.Fragment key={step}>
                    {idx > 0 && (
                      <div
                        style={{
                          flex: 1,
                          height: 2,
                          background: isComplete ? "var(--am-irid)" : "var(--am-border)",
                          borderRadius: 1,
                        }}
                      />
                    )}
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 99,
                        fontSize: 11,
                        fontWeight: 600,
                        background: isCurrent ? "var(--am-chip-strong)" : "transparent",
                        border: "1px solid " + (isCurrent ? "var(--am-border-strong)" : "transparent"),
                        color: isComplete
                          ? "var(--am-accent)"
                          : isCurrent
                            ? "var(--am-text)"
                            : "var(--am-text-muted)",
                      }}
                    >
                      {isComplete ? (
                        <Check size={13} strokeWidth={2.5} />
                      ) : (
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 99,
                            border: `2px solid ${isCurrent ? "var(--am-text)" : "var(--am-border)"}`,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            color: isCurrent ? "var(--am-text)" : "var(--am-text-muted)",
                          }}
                        >
                          {idx + 1}
                        </span>
                      )}
                      <span style={{ display: "none" }} className="sm:inline">
                        {STATUS_LABELS[step]}
                      </span>
                      <span className="hidden sm:inline">{STATUS_LABELS[step]}</span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Periods List */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <SectionLabel style={{ marginBottom: 0 }}>
                  Periods ({currentSeason.periods.length})
                </SectionLabel>
                {currentSeason.status !== "COMPLETED" && (
                  <button
                    type="button"
                    onClick={() => setShowPeriodForm(!showPeriodForm)}
                    style={CHIP_BTN}
                  >
                    {showPeriodForm ? "Cancel" : "+ Add Period"}
                  </button>
                )}
              </div>

              {showPeriodForm && (
                <div
                  style={{
                    marginBottom: 14,
                    borderRadius: 14,
                    border: "1px solid var(--am-border)",
                    background: "var(--am-surface-faint)",
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label style={LABEL_STYLE}>Name</label>
                      <input
                        style={INPUT_STYLE}
                        placeholder="e.g. P1"
                        value={periodName}
                        onChange={(e) => setPeriodName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={LABEL_STYLE}>Start Date</label>
                      <input
                        type="date"
                        style={INPUT_STYLE}
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={LABEL_STYLE}>End Date</label>
                      <input
                        type="date"
                        style={INPUT_STYLE}
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={onCreatePeriod}
                      disabled={busy || !periodName || !periodStart || !periodEnd}
                      style={{
                        ...IRIDESCENT_PILL,
                        padding: "8px 14px",
                        fontSize: 12,
                        opacity: busy || !periodName || !periodStart || !periodEnd ? 0.5 : 1,
                        cursor: busy || !periodName || !periodStart || !periodEnd ? "not-allowed" : "pointer",
                      }}
                    >
                      Create Period
                    </button>
                  </div>
                </div>
              )}

              {currentSeason.periods.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--am-text-muted)", fontStyle: "italic" }}>
                  No periods yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {currentSeason.periods.map((p) => (
                    <div key={p.id}>
                      {editingPeriodId === p.id ? (
                        /* Edit form */
                        <div
                          style={{
                            borderRadius: 14,
                            border: "1px solid var(--am-accent)",
                            background: "var(--am-surface-faint)",
                            padding: 14,
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                          }}
                        >
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                              <label style={LABEL_STYLE}>Name</label>
                              <input
                                style={INPUT_STYLE}
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                              />
                            </div>
                            <div>
                              <label style={LABEL_STYLE}>Start Date</label>
                              <input
                                type="date"
                                style={INPUT_STYLE}
                                value={editStart}
                                onChange={(e) => setEditStart(e.target.value)}
                              />
                            </div>
                            <div>
                              <label style={LABEL_STYLE}>End Date</label>
                              <input
                                type="date"
                                style={INPUT_STYLE}
                                value={editEnd}
                                onChange={(e) => setEditEnd(e.target.value)}
                              />
                            </div>
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => setEditingPeriodId(null)}
                              style={{
                                ...CHIP_BTN,
                                background: "transparent",
                                border: "1px solid transparent",
                                color: "var(--am-text-muted)",
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={onSaveEditPeriod}
                              disabled={busy || !editName || !editStart || !editEnd}
                              style={{
                                ...IRIDESCENT_PILL,
                                padding: "6px 14px",
                                fontSize: 12,
                                opacity: busy || !editName || !editStart || !editEnd ? 0.5 : 1,
                                cursor:
                                  busy || !editName || !editStart || !editEnd ? "not-allowed" : "pointer",
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Display row */
                        <div
                          className="group"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            borderRadius: 14,
                            border: "1px solid var(--am-border)",
                            background: "var(--am-surface-faint)",
                            padding: "12px 16px",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>
                              {p.name}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--am-text-muted)", marginTop: 2 }}>
                              {new Date(p.startDate).toLocaleDateString()} –{" "}
                              {new Date(p.endDate).toLocaleDateString()}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {p.status !== "completed" && (
                              <button
                                type="button"
                                onClick={() => startEditPeriod(p)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{
                                  ...CHIP_BTN,
                                  padding: "4px 10px",
                                  fontSize: 11,
                                  background: "transparent",
                                  border: "1px solid transparent",
                                  color: "var(--am-accent)",
                                }}
                              >
                                Edit
                              </button>
                            )}
                            <select
                              value={p.status}
                              onChange={(e) => onUpdatePeriodStatus(p.id, e.target.value)}
                              disabled={busy}
                              style={{
                                ...INPUT_STYLE,
                                width: "auto",
                                padding: "4px 8px",
                                fontSize: 11,
                                borderRadius: 99,
                              }}
                            >
                              <option value="pending">Pending</option>
                              <option value="active">Active</option>
                              <option value="completed">Completed</option>
                            </select>
                            {p.status === "pending" && (
                              <button
                                type="button"
                                onClick={() => onDeletePeriod(p.id)}
                                disabled={busy}
                                title="Delete Period"
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 26,
                                  height: 26,
                                  borderRadius: 99,
                                  background: "rgba(220, 38, 38, 0.10)",
                                  border: "1px solid rgba(220, 38, 38, 0.28)",
                                  color: "var(--am-negative)",
                                  cursor: busy ? "not-allowed" : "pointer",
                                  padding: 0,
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Glass>
      ) : (
        <Glass>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionLabel>Current Season</SectionLabel>
            <h3 style={SECTION_HEADING}>No Active Season</h3>
            <p style={{ fontSize: 13, color: "var(--am-text-muted)", margin: 0 }}>
              Create a new season below to get started.
            </p>
          </div>
        </Glass>
      )}

      {/* Past Seasons */}
      {seasons.filter((s) => s.status === "COMPLETED").length > 0 && (
        <Glass>
          <SectionLabel>Past Seasons</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {seasons
              .filter((s) => s.status === "COMPLETED")
              .map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderRadius: 12,
                    border: "1px solid var(--am-border)",
                    background: "var(--am-surface-faint)",
                    padding: "8px 14px",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--am-text)" }}>{s.year}</span>
                  <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>
                    {s.periods.length} periods
                  </span>
                </div>
              ))}
          </div>
        </Glass>
      )}

      {/* Create New League Season */}
      <Glass>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <SectionLabel style={{ marginBottom: 0 }}>Create New Season</SectionLabel>
          {currentSeason && (
            <button
              type="button"
              onClick={() => setShowCreateForm(!showCreateForm)}
              style={CHIP_BTN}
            >
              {showCreateForm ? "Cancel" : "+ New Season"}
            </button>
          )}
        </div>

        {!showCreateForm && currentSeason ? (
          <p style={{ fontSize: 12, color: "var(--am-text-muted)", margin: 0 }}>
            Create a new league season with fresh teams and settings. Optionally clone from an
            existing season.
          </p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                const result = await createLeagueSeason({
                  name: newLeagueName.trim(),
                  season: newLeagueYear,
                  draftMode: newDraftMode,
                  copyFromLeagueId: copyFromId || undefined,
                });
                toast(`Created ${result.league.name} ${result.league.season}!`, "success");
                setShowCreateForm(false);
                setNewLeagueName("");
                setCopyFromId(null);
                await load();
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "Failed to create season");
              } finally {
                setBusy(false);
              }
            }}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label style={LABEL_STYLE}>Copy From (Optional)</label>
                <select
                  style={INPUT_STYLE}
                  value={copyFromId ?? ""}
                  onChange={(e) => {
                    const id = Number(e.target.value) || null;
                    setCopyFromId(id);
                    if (id) {
                      const source = allLeagues.find((l) => l.id === id);
                      if (source) {
                        setNewLeagueName(source.name);
                        setNewLeagueYear(source.season + 1);
                      }
                    }
                  }}
                >
                  <option value="">Start Fresh</option>
                  {allLeagues.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} {l.season}
                    </option>
                  ))}
                </select>
                {copyFromId && (
                  <p style={{ marginTop: 4, fontSize: 11, color: "var(--am-accent)" }}>
                    Teams, members, rules, and rosters will be copied from the source season.
                  </p>
                )}
              </div>

              <div>
                <label style={LABEL_STYLE}>League Name</label>
                <input
                  style={{
                    ...INPUT_STYLE,
                    opacity: copyFromId ? 0.6 : 1,
                    cursor: copyFromId ? "not-allowed" : "text",
                  }}
                  value={newLeagueName}
                  onChange={(e) => {
                    if (!copyFromId) setNewLeagueName(e.target.value);
                  }}
                  readOnly={!!copyFromId}
                  placeholder="e.g. OGBA"
                  required
                />
                {copyFromId && (
                  <p style={{ marginTop: 4, fontSize: 11, color: "var(--am-text-muted)" }}>
                    Inherited from source league.
                  </p>
                )}
              </div>

              <div>
                <label style={LABEL_STYLE}>Season Year</label>
                <input
                  type="number"
                  min={2020}
                  max={2100}
                  style={{ ...INPUT_STYLE, fontFamily: "var(--am-mono, ui-monospace)" }}
                  value={newLeagueYear}
                  onChange={(e) => setNewLeagueYear(Number(e.target.value))}
                  required
                />
              </div>

              <div>
                <label style={LABEL_STYLE}>Draft Type</label>
                <select
                  style={INPUT_STYLE}
                  value={newDraftMode}
                  onChange={(e) => setNewDraftMode(e.target.value as "AUCTION" | "DRAFT")}
                >
                  <option value="AUCTION">Auction</option>
                  <option value="DRAFT">Draft</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                disabled={busy || !newLeagueName.trim()}
                style={{
                  ...IRIDESCENT_PILL,
                  padding: "8px 16px",
                  fontSize: 13,
                  opacity: busy || !newLeagueName.trim() ? 0.5 : 1,
                  cursor: busy || !newLeagueName.trim() ? "not-allowed" : "pointer",
                }}
              >
                Create Season
              </button>
            </div>
          </form>
        )}
      </Glass>
    </div>
  );
}
