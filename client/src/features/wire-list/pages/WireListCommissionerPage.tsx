/**
 * /commissioner/:leagueId/wire-list — multi-team view + outcome controls.
 *
 * Drives the consume/free state machine:
 *   PENDING period  → [Lock] button
 *   LOCKED period   → per-Add [Succeed][Fail][Skip] buttons; [Finalize]
 *   PROCESSED period → read-only outcome ledger
 *
 * Re-fetches the full period after every mutation so the consume/free
 * state stays in sync with the server (cheaper than reasoning about
 * which sibling rows changed; ~80 entries max per period).
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { Glass, SectionLabel, Chip } from "../../../components/aurora/atoms";
import "../wireList.css";
import { ApiError } from "../../../api/base";
import { getTeams } from "../../../api";
import {
  getPeriodResults,
  listPeriods,
  createWirePeriod,
  lockPeriod,
  finalizePeriod,
  succeedAdd,
  failAdd,
  skipAdd,
  revertAdd,
  type WaiverPeriod,
  type AddEntry,
  type DropEntry,
  type WaiverAddOutcome,
} from "../api";

interface TeamMeta {
  id: number;
  name: string;
  code: string;
}

export default function WireListCommissionerPage() {
  const { leagueId: leagueIdParam } = useParams<{ leagueId: string }>();
  const leagueId = Number(leagueIdParam);

  const [period, setPeriod] = useState<WaiverPeriod | null>(null);
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [allPeriods, setAllPeriods] = useState<WaiverPeriod[]>([]);
  const [byTeam, setByTeam] = useState<Array<{ teamId: number; adds: AddEntry[]; drops: DropEntry[] }>>([]);
  const [teams, setTeams] = useState<Map<number, TeamMeta>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAddId, setBusyAddId] = useState<number | null>(null);
  const [periodBusy, setPeriodBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newDeadline, setNewDeadline] = useState("");
  const [blockers, setBlockers] = useState<Array<{ addId: number; code: string; detail: string }>>([]);

  const reload = useCallback(async () => {
    if (!Number.isFinite(leagueId)) return;
    setLoading(true);
    setError(null);
    try {
      const [teamsList, { periods }] = await Promise.all([
        getTeams(leagueId),
        listPeriods(leagueId),
      ]);
      const teamMap = new Map<number, TeamMeta>();
      for (const t of teamsList) teamMap.set(t.id, { id: t.id, name: t.name, code: t.code });
      setTeams(teamMap);
      setAllPeriods(periods);

      // Pick the period to display:
      //   1. Whatever the user explicitly switched to (periodId state)
      //   2. The most recent PENDING (active) period
      //   3. The most recent of any status (history viewer)
      let id = periodId;
      if (!id || !periods.find((p) => p.id === id)) {
        const active = periods.find((p) => p.status === "PENDING");
        id = active?.id ?? periods[0]?.id ?? null;
        if (id !== periodId) setPeriodId(id);
      }
      if (!id) {
        setPeriod(null);
        setByTeam([]);
      } else {
        const res = await getPeriodResults(id);
        setPeriod(res.period);
        setByTeam(res.byTeam);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [leagueId, periodId]);

  const handleCreatePeriod = useCallback(async () => {
    if (!newDeadline) return;
    setPeriodBusy(true);
    setError(null);
    try {
      const created = await createWirePeriod(leagueId, new Date(newDeadline).toISOString());
      setPeriodId(created.id);
      setShowCreate(false);
      setNewDeadline("");
      await reload();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string; code?: string } | null;
        setError(`${body?.error ?? err.message}${body?.code ? ` (${body.code})` : ""}`);
      } else {
        setError(String(err));
      }
    } finally {
      setPeriodBusy(false);
    }
  }, [leagueId, newDeadline, reload]);

  useEffect(() => { reload(); }, [reload]);

  const handleAddOutcome = useCallback(async (
    addId: number,
    fn: () => Promise<AddEntry>,
  ) => {
    setBusyAddId(addId);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string; code?: string } | null;
        setError(`${body?.error ?? err.message}${body?.code ? ` (${body.code})` : ""}`);
      } else {
        setError(String(err));
      }
    } finally {
      setBusyAddId(null);
    }
  }, [reload]);

  const handleLock = useCallback(async () => {
    if (!period) return;
    if (!confirm("Lock the period? Owners can no longer modify their lists.")) return;
    setPeriodBusy(true);
    setError(null);
    try {
      await lockPeriod(period.id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setPeriodBusy(false);
    }
  }, [period, reload]);

  const handleFinalize = useCallback(async () => {
    if (!period) return;
    if (!confirm("Finalize? Roster changes will be applied — this cannot be undone via this UI.")) return;
    setPeriodBusy(true);
    setError(null);
    setBlockers([]);
    try {
      const result = await finalizePeriod(period.id);
      alert(`Finalized: ${result.addsApplied} adds applied, ${result.dropsConsumed} drops consumed, ${result.dropsUnused} drops unused.`);
      await reload();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string; code?: string; blockers?: Array<{ addId: number; code: string; detail: string }> } | null;
        if (Array.isArray(body?.blockers) && body.blockers.length > 0) {
          setBlockers(body.blockers);
          setError(null); // blockers UI is the surface; no need for raw error string too
        } else {
          setError(`${body?.error ?? err.message}${body?.code ? ` (${body.code})` : ""}`);
        }
      } else {
        setError(String(err));
      }
    } finally {
      setPeriodBusy(false);
    }
  }, [period, reload]);

  // ─── Render ────────────────────────────────────────────────────────

  if (loading) {
    return <Glass><div style={{ padding: 24, color: "var(--am-text-muted)" }}>Loading…</div></Glass>;
  }

  if (error && !period) {
    return (
      <Glass>
        <div style={{ padding: 24 }}>
          <div style={{ color: "#f87171", marginBottom: 8 }}>{error}</div>
          <button onClick={reload} style={btn}>Retry</button>
        </div>
      </Glass>
    );
  }

  if (!period) {
    return (
      <Glass>
        <div style={{ padding: 24 }}>
          <SectionLabel>Wire List · Commissioner</SectionLabel>
          <div style={{ marginTop: 12, fontSize: 14, color: "var(--am-text-muted)" }}>
            No waiver periods yet. Create one to get started.
          </div>
          <CreatePeriodForm
            value={newDeadline}
            onChange={setNewDeadline}
            onSubmit={handleCreatePeriod}
            busy={periodBusy}
          />
          <Link to={`/commissioner/${leagueId}`} style={{ display: "inline-block", marginTop: 16, color: "var(--am-accent)" }}>
            ← Back to Commissioner
          </Link>
        </div>
      </Glass>
    );
  }

  const isPending = period.status === "PENDING";
  const isLocked = period.status === "LOCKED";
  const isProcessed = period.status === "PROCESSED";

  const totalPending = byTeam.reduce((sum, t) => sum + t.adds.filter((a) => a.outcome === "PENDING").length, 0);

  return (
    <Glass>
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div>
            <SectionLabel>Wire List · Commissioner</SectionLabel>
            <div style={{ fontFamily: "var(--am-display)", fontSize: 18, color: "var(--am-text)", marginTop: 4 }}>
              Period #{period.id} · {new Date(period.deadlineAt).toLocaleString()}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {allPeriods.length > 1 && (
              <select
                value={period.id}
                onChange={(e) => setPeriodId(Number(e.target.value))}
                style={selectStyle}
              >
                {allPeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id} · {p.status} · {new Date(p.deadlineAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            )}
            <button onClick={() => setShowCreate((s) => !s)} style={btn}>+ New period</button>
            <StatusChip status={period.status} />
            {isPending && (
              <button onClick={handleLock} disabled={periodBusy} style={btnPrimary}>
                Lock period
              </button>
            )}
            {isLocked && (
              <button
                onClick={handleFinalize}
                disabled={periodBusy || totalPending > 0}
                title={totalPending > 0 ? `${totalPending} adds still pending — decide every row first` : ""}
                style={totalPending > 0 ? btnDisabled : btnPrimary}
              >
                Finalize ({totalPending} pending)
              </button>
            )}
            <Link to={`/commissioner/${leagueId}`} style={{ fontSize: 13, color: "var(--am-accent)" }}>
              ← Commissioner
            </Link>
          </div>
        </div>

        {showCreate && (
          <CreatePeriodForm
            value={newDeadline}
            onChange={setNewDeadline}
            onSubmit={handleCreatePeriod}
            busy={periodBusy}
          />
        )}

        {blockers.length > 0 && (
          <div className="wl-blockers">
            <div className="wl-blockers-title">
              Finalize blocked — {blockers.length} {blockers.length === 1 ? "outcome is" : "outcomes are"} no longer valid:
            </div>
            {blockers.map((b) => {
              const add = byTeam.flatMap((t) => t.adds).find((a) => a.id === b.addId);
              return (
                <div key={b.addId} className="wl-blocker-row">
                  <span className="wl-blocker-code">{b.code}</span>
                  <span style={{ flex: 1 }}>
                    <strong>{add?.player?.name ?? `Add #${b.addId}`}</strong> · {b.detail}
                  </span>
                  <button
                    onClick={() => handleAddOutcome(b.addId, () => revertAdd(b.addId))}
                    disabled={busyAddId === b.addId}
                    style={btnSmall}
                  >
                    Revert
                  </button>
                </div>
              );
            })}
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--am-text-muted)" }}>
              Revert each blocked Add and re-decide its outcome (FAIL or SKIP), then try Finalize again.
            </div>
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 12, padding: "8px 12px", borderRadius: 8, fontSize: 13,
            background: "color-mix(in srgb, #f87171 12%, transparent)",
            border: "1px solid color-mix(in srgb, #f87171 40%, transparent)",
            color: "var(--am-text)",
          }}>{error}</div>
        )}

        {byTeam.length === 0 ? (
          <div style={{ marginTop: 24, padding: 24, fontSize: 14, color: "var(--am-text-muted)", textAlign: "center" }}>
            No teams have submitted Add or Drop entries for this period.
          </div>
        ) : (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            {byTeam.map((t) => {
              const meta = teams.get(t.teamId);
              return (
                <TeamBlock
                  key={t.teamId}
                  team={meta}
                  teamId={t.teamId}
                  adds={t.adds}
                  drops={t.drops}
                  isLocked={isLocked}
                  isProcessed={isProcessed}
                  busyAddId={busyAddId}
                  onSucceed={(id) => handleAddOutcome(id, () => succeedAdd(id))}
                  onFail={(id) => {
                    const reason = prompt("Reason (optional):") ?? undefined;
                    handleAddOutcome(id, () => failAdd(id, reason || undefined));
                  }}
                  onSkip={(id) => {
                    const reason = prompt("Reason (optional, default = no drop slot):") ?? undefined;
                    handleAddOutcome(id, () => skipAdd(id, reason || undefined));
                  }}
                  onRevert={(id) => handleAddOutcome(id, () => revertAdd(id))}
                />
              );
            })}
          </div>
        )}
      </div>
    </Glass>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────

function CreatePeriodForm({ value, onChange, onSubmit, busy }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  // Seed empty value with a 7-day-out default the first time we render.
  // datetime-local has no placeholder support and uses local-tz strings,
  // so the trick is `toISOString().slice(0, 16)` — but we want LOCAL time
  // not UTC, so we strip the tz offset manually.
  useEffect(() => {
    if (!value) {
      const d = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      d.setSeconds(0, 0);
      onChange(d.toISOString().slice(0, 16));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{
      marginTop: 12, padding: 12, borderRadius: 10,
      background: "var(--am-surface)", border: "1px solid var(--am-border)",
      display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
    }}>
      <label style={{ fontSize: 12, color: "var(--am-text-muted)" }}>Deadline:</label>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "6px 10px", fontSize: 13,
          background: "var(--am-bg)", color: "var(--am-text)",
          border: "1px solid var(--am-border)", borderRadius: 6,
          colorScheme: "dark",
        }}
      />
      <button onClick={onSubmit} disabled={busy} style={busy ? btnDisabled : btnPrimary}>
        Create period
      </button>
    </div>
  );
}


function TeamBlock({
  team, teamId, adds, drops, isLocked, isProcessed, busyAddId,
  onSucceed, onFail, onSkip, onRevert,
}: {
  team?: TeamMeta;
  teamId: number;
  adds: AddEntry[];
  drops: DropEntry[];
  isLocked: boolean;
  isProcessed: boolean;
  busyAddId: number | null;
  onSucceed: (id: number) => void;
  onFail: (id: number) => void;
  onSkip: (id: number) => void;
  onRevert: (id: number) => void;
}) {
  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: "var(--am-surface)", border: "1px solid var(--am-border)",
    }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: "var(--am-display)", fontSize: 16, color: "var(--am-text)" }}>
          {team?.name ?? `Team #${teamId}`}
          {team?.code && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--am-text-muted)" }}>{team.code}</span>}
        </div>
      </div>
      <div className="wl-two-col" style={{ marginTop: 0, gap: 12 }}>
        <div>
          <SectionLabel>Adds</SectionLabel>
          <div style={{ marginTop: 6 }}>
            {adds.length === 0 ? (
              <div style={emptyStyle}>—</div>
            ) : adds.map((a) => (
              <AddRow
                key={a.id}
                entry={a}
                isLocked={isLocked}
                isProcessed={isProcessed}
                busy={busyAddId === a.id}
                onSucceed={onSucceed}
                onFail={onFail}
                onSkip={onSkip}
                onRevert={onRevert}
              />
            ))}
          </div>
        </div>
        <div>
          <SectionLabel>Drops</SectionLabel>
          <div style={{ marginTop: 6 }}>
            {drops.length === 0 ? (
              <div style={emptyStyle}>—</div>
            ) : drops.map((d) => <DropRow key={d.id} entry={d} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddRow({ entry, isLocked, isProcessed, busy, onSucceed, onFail, onSkip, onRevert }: {
  entry: AddEntry;
  isLocked: boolean;
  isProcessed: boolean;
  busy: boolean;
  onSucceed: (id: number) => void;
  onFail: (id: number) => void;
  onSkip: (id: number) => void;
  onRevert: (id: number) => void;
}) {
  const showOutcomeControls = isLocked && entry.outcome === "PENDING";
  const showRevert = isLocked && entry.outcome !== "PENDING" && !isProcessed;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
      padding: "6px 0", borderBottom: "1px solid var(--am-border-subtle)",
      opacity: busy ? 0.5 : 1,
    }}>
      <span style={priorityBadge}>{entry.priority}</span>
      <span style={{ flex: 1, minWidth: 100, color: "var(--am-text)", fontSize: 13 }}>
        {entry.player?.name ?? `#${entry.playerId}`}
      </span>
      <OutcomeChip outcome={entry.outcome} />
      {entry.reason && (
        <span style={{ fontSize: 10, color: "var(--am-text-muted)", fontStyle: "italic", marginLeft: 4 }}>
          {entry.reason}
        </span>
      )}
      {showOutcomeControls && (
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => onSucceed(entry.id)} disabled={busy} style={btnGreen}>✓</button>
          <button onClick={() => onFail(entry.id)} disabled={busy} style={btnRed}>✗</button>
          <button onClick={() => onSkip(entry.id)} disabled={busy} style={btnAmber}>⊘</button>
        </div>
      )}
      {showRevert && (
        <button onClick={() => onRevert(entry.id)} disabled={busy} style={btnSmall}>Revert</button>
      )}
    </div>
  );
}

function DropRow({ entry }: { entry: DropEntry }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "6px 0", borderBottom: "1px solid var(--am-border-subtle)",
    }}>
      <span style={priorityBadge}>{entry.priority}</span>
      <span style={{ flex: 1, color: "var(--am-text)", fontSize: 13 }}>
        {entry.player?.name ?? `#${entry.playerId}`}
      </span>
      <span style={{ fontSize: 10, fontFamily: "var(--am-mono)", color: "var(--am-text-muted)" }}>
        {entry.dropMode === "IL_STASH" ? "IL" : "REL"}
      </span>
      <DropStatusChip status={entry.status} />
    </div>
  );
}

function StatusChip({ status }: { status: WaiverPeriod["status"] }) {
  const color =
    status === "PENDING" ? "#22d3ee" :
    status === "LOCKED" ? "#fbbf24" :
    status === "PROCESSED" ? "#34d399" : "#9ca3af";
  return <Chip color={color}>{status}</Chip>;
}

function OutcomeChip({ outcome }: { outcome: WaiverAddOutcome }) {
  if (outcome === "PENDING") return <span style={{ ...chipBase, color: "var(--am-text-muted)" }}>·</span>;
  const color =
    outcome === "SUCCEEDED" ? "#34d399" :
    outcome === "FAILED" ? "#f87171" : "#fbbf24";
  return <span style={{ ...chipBase, color, borderColor: color }}>{outcome}</span>;
}

function DropStatusChip({ status }: { status: DropEntry["status"] }) {
  if (status === "PENDING") return null;
  const color = status === "CONSUMED" ? "#34d399" : "#9ca3af";
  return <span style={{ ...chipBase, color, borderColor: color }}>{status}</span>;
}

// ─── Styles ──────────────────────────────────────────────────────────

const btn: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, fontSize: 13,
  background: "var(--am-chip)", color: "var(--am-text)",
  border: "1px solid var(--am-border)", cursor: "pointer",
};
const btnPrimary: React.CSSProperties = { ...btn, background: "var(--am-accent)", color: "var(--am-bg)", border: "none" };
const btnDisabled: React.CSSProperties = { ...btn, opacity: 0.4, cursor: "not-allowed" };
const btnSmall: React.CSSProperties = { ...btn, padding: "2px 8px", fontSize: 11 };
const btnGreen: React.CSSProperties = { ...btnSmall, background: "color-mix(in srgb, #34d399 20%, var(--am-chip))" };
const btnRed: React.CSSProperties = { ...btnSmall, background: "color-mix(in srgb, #f87171 20%, var(--am-chip))" };
const btnAmber: React.CSSProperties = { ...btnSmall, background: "color-mix(in srgb, #fbbf24 20%, var(--am-chip))" };

const priorityBadge: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minWidth: 22, height: 22, borderRadius: 5,
  background: "var(--am-chip)", color: "var(--am-text-muted)",
  fontFamily: "var(--am-mono)", fontSize: 11, fontWeight: 600,
};

const chipBase: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 6px", borderRadius: 4,
  fontSize: 10, fontWeight: 600, fontFamily: "var(--am-mono)",
  border: "1px solid transparent",
};

const emptyStyle: React.CSSProperties = {
  padding: "8px 0", fontSize: 12, color: "var(--am-text-muted)",
};

const selectStyle: React.CSSProperties = {
  padding: "4px 8px", fontSize: 12, fontFamily: "var(--am-mono)",
  background: "var(--am-bg)", color: "var(--am-text)",
  border: "1px solid var(--am-border)", borderRadius: 6,
};
