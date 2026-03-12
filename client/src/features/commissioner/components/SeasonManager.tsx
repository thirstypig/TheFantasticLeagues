import React, { useEffect, useState } from "react";
import {
  getSeasons,
  getCurrentSeason,
  createSeason,
  transitionSeason,
  createPeriod,
  updatePeriod,
  deletePeriod,
  type Season,
  type SeasonStatus,
} from "../../seasons/api";

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const STATUS_STEPS: SeasonStatus[] = ["SETUP", "DRAFT", "IN_SEASON", "COMPLETED"];
const STATUS_LABELS: Record<SeasonStatus, string> = {
  SETUP: "Setup",
  DRAFT: "Draft",
  IN_SEASON: "In Season",
  COMPLETED: "Completed",
};
const STATUS_COLORS: Record<SeasonStatus, string> = {
  SETUP: "bg-blue-500/20 text-blue-400",
  DRAFT: "bg-amber-500/20 text-amber-400",
  IN_SEASON: "bg-green-500/20 text-green-400",
  COMPLETED: "bg-[var(--lg-text-muted)]/20 text-[var(--lg-text-muted)]",
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

interface Props {
  leagueId: number;
}

export default function SeasonManager({ leagueId }: Props) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create season form
  const [newYear, setNewYear] = useState(new Date().getFullYear());

  // Create period form
  const [showPeriodForm, setShowPeriodForm] = useState(false);
  const [periodName, setPeriodName] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [allSeasons, current] = await Promise.all([
        getSeasons(leagueId),
        getCurrentSeason(leagueId),
      ]);
      setSeasons(allSeasons);
      setCurrentSeason(current);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load seasons");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [leagueId]);

  async function onCreateSeason() {
    setBusy(true);
    setError(null);
    try {
      await createSeason(leagueId, newYear);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create season");
    } finally {
      setBusy(false);
    }
  }

  async function onTransition(seasonId: number, nextStatus: SeasonStatus) {
    const warning = TRANSITION_WARNINGS[nextStatus];
    if (warning && !window.confirm(warning)) return;

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
    if (!window.confirm("Delete this period?")) return;
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

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-6 text-center text-sm text-[var(--lg-text-muted)]">
        Loading seasons…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Current Season or Create */}
      {currentSeason ? (
        <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[var(--lg-text-heading)]">
                {currentSeason.year} Season
              </h3>
              <span className={cls("mt-1 inline-block rounded-full px-3 py-0.5 text-xs font-semibold", STATUS_COLORS[currentSeason.status])}>
                {STATUS_LABELS[currentSeason.status]}
              </span>
            </div>

            {NEXT_STATUS[currentSeason.status] && (
              <button
                onClick={() => onTransition(currentSeason.id, NEXT_STATUS[currentSeason.status])}
                disabled={busy}
                className={cls(
                  "rounded-xl bg-[var(--lg-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity",
                  busy && "opacity-60 cursor-not-allowed"
                )}
              >
                Advance to {STATUS_LABELS[NEXT_STATUS[currentSeason.status]]}
              </button>
            )}
          </div>

          {/* Status Stepper */}
          <div className="flex items-center gap-1">
            {STATUS_STEPS.map((step, idx) => {
              const stepIdx = STATUS_STEPS.indexOf(step);
              const currentIdx = STATUS_STEPS.indexOf(currentSeason.status);
              const isComplete = stepIdx < currentIdx;
              const isCurrent = stepIdx === currentIdx;

              return (
                <React.Fragment key={step}>
                  {idx > 0 && (
                    <div className={cls(
                      "flex-1 h-0.5",
                      isComplete ? "bg-[var(--lg-accent)]" : "bg-[var(--lg-border-subtle)]"
                    )} />
                  )}
                  <div className={cls(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold",
                    isCurrent && "bg-[var(--lg-accent)]/10 text-[var(--lg-accent)] ring-1 ring-[var(--lg-accent)]/30",
                    isComplete && "text-[var(--lg-accent)]",
                    !isCurrent && !isComplete && "text-[var(--lg-text-muted)]"
                  )}>
                    {isComplete ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <span className={cls(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px]",
                        isCurrent ? "border-[var(--lg-accent)] text-[var(--lg-accent)]" : "border-[var(--lg-border-subtle)] text-[var(--lg-text-muted)]"
                      )}>
                        {idx + 1}
                      </span>
                    )}
                    <span className="hidden sm:inline">{STATUS_LABELS[step]}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* Periods List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-[var(--lg-text-heading)]">
                Periods ({currentSeason.periods.length})
              </h4>
              {(currentSeason.status === "SETUP" || currentSeason.status === "DRAFT") && (
                <button
                  onClick={() => setShowPeriodForm(!showPeriodForm)}
                  className="text-xs text-[var(--lg-accent)] hover:underline"
                >
                  {showPeriodForm ? "Cancel" : "+ Add Period"}
                </button>
              )}
            </div>

            {showPeriodForm && (
              <div className="mb-4 rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs text-[var(--lg-text-muted)] mb-1">Name</label>
                    <input
                      className="w-full rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none"
                      placeholder="e.g. P1"
                      value={periodName}
                      onChange={(e) => setPeriodName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--lg-text-muted)] mb-1">Start Date</label>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--lg-text-muted)] mb-1">End Date</label>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={onCreatePeriod}
                    disabled={busy || !periodName || !periodStart || !periodEnd}
                    className={cls(
                      "rounded-lg bg-[var(--lg-accent)] px-4 py-2 text-sm font-semibold text-white",
                      (busy || !periodName || !periodStart || !periodEnd) && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    Create Period
                  </button>
                </div>
              </div>
            )}

            {currentSeason.periods.length === 0 ? (
              <div className="text-sm text-[var(--lg-text-muted)] italic">No periods yet.</div>
            ) : (
              <div className="space-y-2">
                {currentSeason.periods.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-4 py-3 group"
                  >
                    <div>
                      <div className="text-sm font-semibold text-[var(--lg-text-primary)]">{p.name}</div>
                      <div className="text-xs text-[var(--lg-text-muted)]">
                        {new Date(p.startDate).toLocaleDateString()} – {new Date(p.endDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={p.status}
                        onChange={(e) => onUpdatePeriodStatus(p.id, e.target.value)}
                        disabled={busy}
                        className="rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-2 py-1 text-xs text-[var(--lg-text-primary)] outline-none"
                      >
                        <option value="pending">Pending</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                      </select>
                      {p.status === "pending" && (
                        <button
                          onClick={() => onDeletePeriod(p.id)}
                          disabled={busy}
                          className="rounded-lg bg-red-500/10 p-1.5 text-red-500 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete Period"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5 space-y-4">
          <h3 className="text-lg font-semibold text-[var(--lg-text-heading)]">No Active Season</h3>
          <p className="text-sm text-[var(--lg-text-muted)]">Create a new season to start managing periods and rules locking.</p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={2020}
              max={2100}
              className="w-24 rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none"
              value={newYear}
              onChange={(e) => setNewYear(Number(e.target.value))}
            />
            <button
              onClick={onCreateSeason}
              disabled={busy}
              className={cls(
                "rounded-lg bg-[var(--lg-accent)] px-4 py-2 text-sm font-semibold text-white",
                busy && "opacity-60 cursor-not-allowed"
              )}
            >
              Create Season
            </button>
          </div>
        </div>
      )}

      {/* Past Seasons */}
      {seasons.filter((s) => s.status === "COMPLETED").length > 0 && (
        <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
          <h4 className="text-sm font-semibold text-[var(--lg-text-heading)] mb-3">Past Seasons</h4>
          <div className="space-y-2">
            {seasons.filter((s) => s.status === "COMPLETED").map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-surface)] px-4 py-2">
                <span className="text-sm text-[var(--lg-text-primary)]">{s.year}</span>
                <span className="text-xs text-[var(--lg-text-muted)]">{s.periods.length} periods</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
