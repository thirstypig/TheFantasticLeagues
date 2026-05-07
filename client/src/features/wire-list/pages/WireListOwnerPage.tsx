/**
 * /teams/:teamCode/wire-list — owner two-list view backed by /api/wire-list/*.
 *
 * Slice 1 (this file): view existing entries, reorder via up/down arrows,
 * delete, change drop mode. Adding entries (FA picker for adds, roster
 * picker for drops) ships in slice 2.
 *
 * Read-only when period.status !== "PENDING" (LOCKED / PROCESSED).
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useLeague } from "../../../contexts/LeagueContext";
import { Glass, SectionLabel, Chip } from "../../../components/aurora/atoms";
import { ApiError } from "../../../api/base";
import {
  getActivePeriod,
  getAddEntries,
  getDropEntries,
  updateAddPriority,
  updateDropEntry,
  deleteAddEntry,
  deleteDropEntry,
  type WaiverPeriod,
  type AddEntry,
  type DropEntry,
  type WaiverDropMode,
} from "../api";
import { getTeams } from "../../teams/api";

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function PosPill({ pos }: { pos: string | null }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 28, padding: "2px 8px", borderRadius: 6,
      background: "var(--am-chip-strong)", color: "var(--am-text)",
      fontFamily: "var(--am-mono)", fontSize: 11, fontWeight: 600,
      border: "1px solid var(--am-border)",
    }}>{pos ?? "—"}</span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export default function WireListOwnerPage() {
  const { teamCode } = useParams<{ teamCode: string }>();
  const { leagueId } = useLeague();

  const [teamId, setTeamId] = useState<number | null>(null);
  const [period, setPeriod] = useState<WaiverPeriod | null>(null);
  const [adds, setAdds] = useState<AddEntry[]>([]);
  const [drops, setDrops] = useState<DropEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<number>>(new Set());

  const reload = useCallback(async () => {
    if (!leagueId || !teamCode) return;
    setLoading(true);
    setError(null);
    try {
      const teams = await getTeams(leagueId);
      const team = teams.find((t) => t.code === teamCode);
      if (!team) {
        setError(`No team with code ${teamCode}`);
        setLoading(false);
        return;
      }
      setTeamId(team.id);

      const { period: p } = await getActivePeriod(leagueId);
      setPeriod(p);
      if (p) {
        const [a, d] = await Promise.all([
          getAddEntries(p.id, team.id),
          getDropEntries(p.id, team.id),
        ]);
        setAdds(a.entries);
        setDrops(d.entries);
      } else {
        setAdds([]);
        setDrops([]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [leagueId, teamCode]);

  useEffect(() => { reload(); }, [reload]);

  const isReadOnly = !period || period.status !== "PENDING";

  const withPending = useCallback(<T,>(id: number, fn: () => Promise<T>): Promise<T> => {
    setPending((s) => new Set(s).add(id));
    return fn().finally(() => {
      setPending((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    });
  }, []);

  // Swap two adjacent priorities. We use a temporary out-of-band priority on
  // one of them to dodge the (periodId, teamId, priority) unique constraint
  // — Postgres validates uniqueness at statement boundary, not commit.
  const swapAddPriorities = useCallback(async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= adds.length) return;
    const a = adds[i];
    const b = adds[j];
    const tempPriority = Math.max(...adds.map((x) => x.priority)) + 100;
    try {
      await withPending(a.id, () => updateAddPriority(a.id, tempPriority));
      await withPending(b.id, () => updateAddPriority(b.id, a.priority));
      await withPending(a.id, () => updateAddPriority(a.id, b.priority));
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      await reload();
    }
  }, [adds, reload, withPending]);

  const swapDropPriorities = useCallback(async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= drops.length) return;
    const a = drops[i];
    const b = drops[j];
    const tempPriority = Math.max(...drops.map((x) => x.priority)) + 100;
    try {
      await withPending(a.id, () => updateDropEntry(a.id, { priority: tempPriority }));
      await withPending(b.id, () => updateDropEntry(b.id, { priority: a.priority }));
      await withPending(a.id, () => updateDropEntry(a.id, { priority: b.priority }));
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      await reload();
    }
  }, [drops, reload, withPending]);

  const removeAdd = useCallback(async (id: number) => {
    try {
      await withPending(id, () => deleteAddEntry(id));
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }, [reload, withPending]);

  const removeDrop = useCallback(async (id: number) => {
    try {
      await withPending(id, () => deleteDropEntry(id));
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }, [reload, withPending]);

  const setDropMode = useCallback(async (id: number, dropMode: WaiverDropMode) => {
    try {
      await withPending(id, () => updateDropEntry(id, { dropMode }));
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }, [reload, withPending]);

  // ─── Render ────────────────────────────────────────────────────────

  if (loading) {
    return <Glass><div style={{ padding: 24, color: "var(--am-text-muted)" }}>Loading Waiver Wire…</div></Glass>;
  }

  if (error) {
    return (
      <Glass>
        <div style={{ padding: 24 }}>
          <div style={{ color: "#f87171", marginBottom: 8 }}>Error: {error}</div>
          <button onClick={reload} style={btnStyle}>Retry</button>
        </div>
      </Glass>
    );
  }

  if (!period) {
    return (
      <Glass>
        <div style={{ padding: 24 }}>
          <SectionLabel>Waiver Wire</SectionLabel>
          <div style={{ marginTop: 12, fontSize: 14, color: "var(--am-text-muted)" }}>
            No active waiver period. Your commissioner will open one before the next deadline.
          </div>
          <Link to={`/teams/${teamCode}`} style={{ display: "inline-block", marginTop: 16, color: "var(--am-accent)" }}>
            ← Back to roster
          </Link>
        </div>
      </Glass>
    );
  }

  const showWarning = adds.length > drops.length;
  const overflow = adds.length - drops.length;
  const statusChip =
    period.status === "PENDING" ? null :
    period.status === "LOCKED" ? <Chip color="#fbbf24">LOCKED — read only</Chip> :
    period.status === "PROCESSED" ? <Chip color="#34d399">PROCESSED</Chip> :
    <Chip>CANCELLED</Chip>;

  return (
    <Glass>
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div>
            <SectionLabel>Waiver Wire List</SectionLabel>
            <div style={{ fontFamily: "var(--am-display)", fontSize: 18, color: "var(--am-text)", marginTop: 4 }}>
              Locks {formatDeadline(period.deadlineAt)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {statusChip}
            <Link to={`/teams/${teamCode}`} style={{ fontSize: 13, color: "var(--am-accent)" }}>
              ← Back to roster
            </Link>
          </div>
        </div>

        {showWarning && (
          <div style={{
            marginTop: 16, padding: "10px 14px",
            background: "color-mix(in srgb, #fbbf24 8%, transparent)",
            border: "1px dashed color-mix(in srgb, #fbbf24 40%, transparent)",
            borderRadius: 10, fontSize: 13, color: "var(--am-text)",
          }}>
            <strong>Heads up:</strong> {overflow} more {overflow === 1 ? "Add" : "Adds"} than {drops.length === 1 ? "Drop" : "Drops"}.
            {" "}If more than {drops.length} {drops.length === 1 ? "Add succeeds" : "Adds succeed"}, the extras will be SKIPPED — no drop slot.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          {/* Add list */}
          <Section>
            <SectionLabel>Add list · ranked top → bottom</SectionLabel>
            <div style={{ marginTop: 8 }}>
              {adds.length === 0 ? (
                <Empty>
                  No Adds yet.{" "}
                  {!isReadOnly && <Link to={`/players?leagueId=${leagueId}`} style={linkStyle}>Browse free agents →</Link>}
                </Empty>
              ) : (
                adds.map((a, i) => (
                  <Row key={a.id} pending={pending.has(a.id)}>
                    <PriorityBadge>{a.priority}</PriorityBadge>
                    <PosPill pos={a.player?.posPrimary ?? null} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: "var(--am-text)" }}>{a.player?.name ?? `#${a.playerId}`}</div>
                      <div style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{a.player?.mlbTeam ?? "FA"}</div>
                    </div>
                    {!isReadOnly && (
                      <RowActions>
                        <ArrowBtn disabled={i === 0} onClick={() => swapAddPriorities(i, -1)}>▲</ArrowBtn>
                        <ArrowBtn disabled={i === adds.length - 1} onClick={() => swapAddPriorities(i, +1)}>▼</ArrowBtn>
                        <RemoveBtn onClick={() => removeAdd(a.id)} />
                      </RowActions>
                    )}
                  </Row>
                ))
              )}
            </div>
          </Section>

          {/* Drop list */}
          <Section>
            <SectionLabel>Drop list · top = drop first</SectionLabel>
            <div style={{ marginTop: 8 }}>
              {drops.length === 0 ? (
                <Empty>
                  No Drops yet.{" "}
                  {!isReadOnly && <Link to={`/teams/${teamCode}`} style={linkStyle}>Pick from your roster →</Link>}
                </Empty>
              ) : (
                drops.map((d, i) => (
                  <Row key={d.id} pending={pending.has(d.id)}>
                    <PriorityBadge>{d.priority}</PriorityBadge>
                    <PosPill pos={d.player?.posPrimary ?? null} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: "var(--am-text)" }}>{d.player?.name ?? `#${d.playerId}`}</div>
                      <div style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{d.player?.mlbTeam ?? "—"}</div>
                    </div>
                    <ModeToggle
                      value={d.dropMode}
                      disabled={isReadOnly || pending.has(d.id)}
                      onChange={(m) => setDropMode(d.id, m)}
                    />
                    {!isReadOnly && (
                      <RowActions>
                        <ArrowBtn disabled={i === 0} onClick={() => swapDropPriorities(i, -1)}>▲</ArrowBtn>
                        <ArrowBtn disabled={i === drops.length - 1} onClick={() => swapDropPriorities(i, +1)}>▼</ArrowBtn>
                        <RemoveBtn onClick={() => removeDrop(d.id)} />
                      </RowActions>
                    )}
                  </Row>
                ))
              )}
            </div>
          </Section>
        </div>

        {/* Use teamId in a hidden anchor so a server admin script can grep
            this DOM in dev without re-resolving teamCode. Cheap, harmless. */}
        {teamId !== null && <span data-team-id={teamId} style={{ display: "none" }} />}
      </div>
    </Glass>
  );
}

// ─── Atoms (kept inline so the slice stays self-contained) ───────────

const linkStyle: React.CSSProperties = { color: "var(--am-accent)", textDecoration: "underline" };
const btnStyle: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, fontSize: 13,
  background: "var(--am-chip)", color: "var(--am-text)",
  border: "1px solid var(--am-border)", cursor: "pointer",
};

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: "var(--am-surface)", border: "1px solid var(--am-border)",
    }}>{children}</div>
  );
}

function Row({ children, pending }: { children: React.ReactNode; pending: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 6px", borderRadius: 8,
      borderBottom: "1px solid var(--am-border-subtle)",
      opacity: pending ? 0.5 : 1,
      transition: "opacity 120ms ease",
    }}>{children}</div>
  );
}

function PriorityBadge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 24, height: 24, borderRadius: 6,
      background: "var(--am-chip)", color: "var(--am-text-muted)",
      fontFamily: "var(--am-mono)", fontSize: 12, fontWeight: 600,
    }}>{children}</span>
  );
}

function RowActions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 4 }}>{children}</div>;
}

function ArrowBtn({ children, disabled, onClick }: {
  children: React.ReactNode; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 26, height: 26, borderRadius: 6,
        background: "var(--am-chip)", color: "var(--am-text)",
        border: "1px solid var(--am-border)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        fontSize: 11, lineHeight: 1,
      }}
    >{children}</button>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 26, height: 26, borderRadius: 6,
        background: "transparent", color: "var(--am-text-muted)",
        border: "1px solid var(--am-border)",
        cursor: "pointer", fontSize: 14, lineHeight: 1,
      }}
      aria-label="Remove"
    >×</button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "24px 8px", fontSize: 13, color: "var(--am-text-muted)", textAlign: "center" }}>
      {children}
    </div>
  );
}

function ModeToggle({ value, disabled, onChange }: {
  value: WaiverDropMode; disabled: boolean; onChange: (m: WaiverDropMode) => void;
}) {
  return (
    <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--am-border)" }}>
      {(["RELEASE", "IL_STASH"] as WaiverDropMode[]).map((m) => (
        <button
          key={m}
          onClick={() => !disabled && value !== m && onChange(m)}
          disabled={disabled}
          style={{
            padding: "4px 8px", fontSize: 10, fontWeight: 600,
            background: value === m ? "var(--am-accent)" : "transparent",
            color: value === m ? "var(--am-bg)" : "var(--am-text-muted)",
            border: "none",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >{m === "RELEASE" ? "REL" : "IL"}</button>
      ))}
    </div>
  );
}
