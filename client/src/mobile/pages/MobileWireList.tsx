/**
 * Mobile twin of WireListOwnerPage — /teams/:code/wire-list on narrow viewports.
 *
 * Data-fetching logic mirrors WireListOwnerPage exactly (same hooks, same API
 * calls, same state shape). UI uses Aurora mobile atoms instead of Glass.
 *
 * teamCode is received as a prop (parsed from pathname in MobileShell.pickMobilePage)
 * rather than via useParams, because this component renders outside any
 * React Router <Route> match context — useParams would return {}.
 */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLeague } from "../../contexts/LeagueContext";
import { ApiError } from "../../api/base";
import {
  getActivePeriod,
  getAddEntries,
  getDropEntries,
  updateDropEntry,
  deleteAddEntry,
  deleteDropEntry,
  reorderEntries,
  type WaiverPeriod,
  type AddEntry,
  type DropEntry,
  type WaiverDropMode,
} from "../../features/wire-list/api";
import { getTeams } from "../../features/teams/api";
import AddPicker from "../../features/wire-list/components/AddPicker";
import DropPicker from "../../features/wire-list/components/DropPicker";
import { MobileTopbar } from "../MobileTopbar";
import { MCard, MSection, MLabel } from "../atoms/MCard";
import { Glyph } from "../atoms/Glyph";

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// ─── Sub-components ──────────────────────────────────────────────────

function ModeToggle({ value, disabled, onChange }: {
  value: WaiverDropMode; disabled: boolean; onChange: (m: WaiverDropMode) => void;
}) {
  return (
    <div style={{
      display: "inline-flex", borderRadius: 6, overflow: "hidden",
      border: "1px solid var(--am-border)",
    }}>
      {(["RELEASE", "IL_STASH"] as WaiverDropMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => !disabled && value !== m && onChange(m)}
          disabled={disabled}
          style={{
            padding: "5px 8px", fontSize: 10, fontWeight: 600, lineHeight: 1,
            background: value === m ? "var(--am-accent)" : "transparent",
            color: value === m ? "var(--am-bg)" : "var(--am-text-muted)",
            border: "none",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {m === "RELEASE" ? "REL" : "IL"}
        </button>
      ))}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────

interface MobileWireListProps {
  teamCode: string;
}

// ─── Page ────────────────────────────────────────────────────────────

export function MobileWireList({ teamCode }: MobileWireListProps) {
  const nav = useNavigate();
  const { leagueId } = useLeague();

  const [teamId, setTeamId] = useState<number | null>(null);
  const [period, setPeriod] = useState<WaiverPeriod | null>(null);
  const [adds, setAdds] = useState<AddEntry[]>([]);
  const [drops, setDrops] = useState<DropEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [showDropPicker, setShowDropPicker] = useState(false);

  const addPlayerIds = useMemo(() => new Set(adds.map((a) => a.playerId)), [adds]);
  const dropPlayerIds = useMemo(() => new Set(drops.map((d) => d.playerId)), [drops]);

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

  const swapAddPriorities = useCallback(async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= adds.length) return;
    if (!period || teamId === null) return;
    const a = adds[i];
    const b = adds[j];
    const reordered = adds.slice();
    reordered[i] = b;
    reordered[j] = a;
    const orderedIds = reordered.map((x) => x.id);
    const optimistic = reordered.map((x, idx) => ({ ...x, priority: idx + 1 }));
    setAdds(optimistic);
    try {
      await withPending(a.id, () =>
        reorderEntries(period.id, "ADD", teamId, orderedIds),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      await reload();
    }
  }, [adds, period, teamId, reload, withPending]);

  const swapDropPriorities = useCallback(async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= drops.length) return;
    if (!period || teamId === null) return;
    const a = drops[i];
    const b = drops[j];
    const reordered = drops.slice();
    reordered[i] = b;
    reordered[j] = a;
    const orderedIds = reordered.map((x) => x.id);
    const optimistic = reordered.map((x, idx) => ({ ...x, priority: idx + 1 }));
    setDrops(optimistic);
    try {
      await withPending(a.id, () =>
        reorderEntries(period.id, "DROP", teamId, orderedIds),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      await reload();
    }
  }, [drops, period, teamId, reload, withPending]);

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

  // ─── Loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div data-testid="mobile-wire-list">
        <MobileTopbar
          title="Wire List"
          subtitle="Waiver picks"
          leading={<Glyph kind="back" size={20} />}
          onLeadingClick={() => nav(-1)}
        />
        <div style={{ padding: "0 14px" }}>
          <MCard>
            <MLabel>Waiver Wire</MLabel>
            <p style={{ fontSize: 14, color: "var(--am-text-muted)", marginTop: 8 }}>
              Loading Waiver Wire…
            </p>
          </MCard>
        </div>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────

  if (error) {
    return (
      <div data-testid="mobile-wire-list">
        <MobileTopbar
          title="Wire List"
          subtitle="Waiver picks"
          leading={<Glyph kind="back" size={20} />}
          onLeadingClick={() => nav(-1)}
        />
        <div style={{ padding: "0 14px" }}>
          <MCard>
            <div style={{ color: "#f87171", marginBottom: 8, fontSize: 13 }}>Error: {error}</div>
            <button
              type="button"
              onClick={reload}
              style={{
                padding: "6px 12px", borderRadius: 8, fontSize: 13,
                background: "var(--am-chip)", color: "var(--am-text)",
                border: "1px solid var(--am-border)", cursor: "pointer",
              }}
            >
              Retry
            </button>
          </MCard>
        </div>
      </div>
    );
  }

  // ─── No active period ─────────────────────────────────────────────

  if (!period) {
    return (
      <div data-testid="mobile-wire-list">
        <MobileTopbar
          title="Wire List"
          subtitle="Waiver picks"
          leading={<Glyph kind="back" size={20} />}
          onLeadingClick={() => nav(-1)}
        />
        <div style={{ padding: "0 14px" }}>
          <MCard>
            <MLabel>Waiver Wire</MLabel>
            <p style={{ fontSize: 14, color: "var(--am-text-muted)", marginTop: 8 }}>
              No active waiver period. Your commissioner will open one before the next deadline.
            </p>
          </MCard>
        </div>
      </div>
    );
  }

  // ─── Active period ────────────────────────────────────────────────

  const showWarning = adds.length > drops.length;
  const overflow = adds.length - drops.length;

  return (
    <div data-testid="mobile-wire-list">
      <MobileTopbar
        title="Wire List"
        subtitle={isReadOnly ? "Read only" : `Locks ${formatDeadline(period.deadlineAt)}`}
        leading={<Glyph kind="back" size={20} />}
        onLeadingClick={() => nav(-1)}
        trailing={<Glyph kind="moreDots" size={20} />}
      />

      <div style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Warning banner: more Adds than Drops */}
        {showWarning && (
          <div style={{
            padding: "10px 14px",
            background: "color-mix(in srgb, #fbbf24 8%, transparent)",
            border: "1px dashed color-mix(in srgb, #fbbf24 40%, transparent)",
            borderRadius: 12, fontSize: 13, color: "var(--am-text)",
          }}>
            <strong>Heads up:</strong> {overflow} more {overflow === 1 ? "Add" : "Adds"} than {drops.length === 1 ? "Drop" : "Drops"}.
            {" "}If more than {drops.length} {drops.length === 1 ? "Add succeeds" : "Adds succeed"}, the extras will be SKIPPED — no drop slot.
          </div>
        )}

        {/* Add list */}
        <MSection
          title="Add list"
          action={!isReadOnly && !showAddPicker ? "+ Add player" : undefined}
          onActionClick={() => setShowAddPicker(true)}
        >
          {showAddPicker && period && teamId !== null && leagueId && (
            <div style={{ marginBottom: 8 }}>
              <AddPicker
                periodId={period.id}
                teamId={teamId}
                leagueId={leagueId}
                excludePlayerIds={addPlayerIds}
                onAdded={() => { setShowAddPicker(false); reload(); }}
                onClose={() => setShowAddPicker(false)}
              />
            </div>
          )}
          <MCard padded={false}>
            {adds.length === 0 ? (
              <div style={{ padding: "24px 14px", fontSize: 13, color: "var(--am-text-muted)", textAlign: "center" }}>
                No Adds yet.{" "}
                {!isReadOnly && !showAddPicker && (
                  <button
                    type="button"
                    onClick={() => setShowAddPicker(true)}
                    style={{ background: "none", border: "none", padding: 0, color: "var(--am-accent)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
                  >
                    Add a player →
                  </button>
                )}
              </div>
            ) : (
              adds.map((a, i) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 14px",
                    borderBottom: i < adds.length - 1 ? "1px solid var(--am-border-subtle)" : undefined,
                    opacity: pending.has(a.id) ? 0.5 : 1,
                    transition: "opacity 120ms ease",
                  }}
                >
                  {/* Priority badge */}
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: 24, height: 24, borderRadius: 6,
                    background: "var(--am-chip)", color: "var(--am-text-muted)",
                    fontFamily: "var(--am-mono)", fontSize: 12, fontWeight: 600,
                    flexShrink: 0,
                  }}>
                    {a.priority}
                  </span>
                  {/* Position pill */}
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    padding: "2px 6px", borderRadius: 6,
                    background: "var(--am-chip-strong)", color: "var(--am-text)",
                    fontFamily: "var(--am-mono)", fontSize: 11, fontWeight: 600,
                    border: "1px solid var(--am-border)",
                    flexShrink: 0,
                  }}>
                    {a.player?.posPrimary ?? "—"}
                  </span>
                  {/* Player name + team */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--am-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.player?.name ?? `#${a.playerId}`}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--am-text-muted)" }}>
                      {a.player?.mlbTeam ?? "FA"}
                    </div>
                  </div>
                  {/* Reorder + remove */}
                  {!isReadOnly && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => swapAddPriorities(i, -1)}
                        disabled={i === 0}
                        style={arrowBtnStyle(i === 0)}
                        aria-label="Move up"
                      >▲</button>
                      <button
                        type="button"
                        onClick={() => swapAddPriorities(i, 1)}
                        disabled={i === adds.length - 1}
                        style={arrowBtnStyle(i === adds.length - 1)}
                        aria-label="Move down"
                      >▼</button>
                      <button
                        type="button"
                        onClick={() => removeAdd(a.id)}
                        disabled={pending.has(a.id)}
                        style={removeBtnStyle}
                        aria-label="Remove"
                      >×</button>
                    </div>
                  )}
                </div>
              ))
            )}
          </MCard>
        </MSection>

        {/* Drop list */}
        <MSection
          title="Drop list"
          action={!isReadOnly && !showDropPicker ? "+ Add drop" : undefined}
          onActionClick={() => setShowDropPicker(true)}
          style={{ marginBottom: 8 }}
        >
          {showDropPicker && period && teamId !== null && (
            <div style={{ marginBottom: 8 }}>
              <DropPicker
                periodId={period.id}
                teamId={teamId}
                excludePlayerIds={dropPlayerIds}
                onAdded={() => { setShowDropPicker(false); reload(); }}
                onClose={() => setShowDropPicker(false)}
              />
            </div>
          )}
          <MCard padded={false}>
            {drops.length === 0 ? (
              <div style={{ padding: "24px 14px", fontSize: 13, color: "var(--am-text-muted)", textAlign: "center" }}>
                No Drops yet.{" "}
                {!isReadOnly && !showDropPicker && (
                  <button
                    type="button"
                    onClick={() => setShowDropPicker(true)}
                    style={{ background: "none", border: "none", padding: 0, color: "var(--am-accent)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
                  >
                    Pick from your roster →
                  </button>
                )}
              </div>
            ) : (
              drops.map((d, i) => (
                <div
                  key={d.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 14px",
                    borderBottom: i < drops.length - 1 ? "1px solid var(--am-border-subtle)" : undefined,
                    opacity: pending.has(d.id) ? 0.5 : 1,
                    transition: "opacity 120ms ease",
                  }}
                >
                  {/* Priority badge */}
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: 24, height: 24, borderRadius: 6,
                    background: "var(--am-chip)", color: "var(--am-text-muted)",
                    fontFamily: "var(--am-mono)", fontSize: 12, fontWeight: 600,
                    flexShrink: 0,
                  }}>
                    {d.priority}
                  </span>
                  {/* Position pill */}
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    padding: "2px 6px", borderRadius: 6,
                    background: "var(--am-chip-strong)", color: "var(--am-text)",
                    fontFamily: "var(--am-mono)", fontSize: 11, fontWeight: 600,
                    border: "1px solid var(--am-border)",
                    flexShrink: 0,
                  }}>
                    {d.player?.posPrimary ?? "—"}
                  </span>
                  {/* Player name + team */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--am-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.player?.name ?? `#${d.playerId}`}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--am-text-muted)" }}>
                      {d.player?.mlbTeam ?? "—"}
                    </div>
                  </div>
                  {/* Mode toggle */}
                  <ModeToggle
                    value={d.dropMode}
                    disabled={isReadOnly || pending.has(d.id)}
                    onChange={(m) => setDropMode(d.id, m)}
                  />
                  {/* Reorder + remove */}
                  {!isReadOnly && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => swapDropPriorities(i, -1)}
                        disabled={i === 0}
                        style={arrowBtnStyle(i === 0)}
                        aria-label="Move up"
                      >▲</button>
                      <button
                        type="button"
                        onClick={() => swapDropPriorities(i, 1)}
                        disabled={i === drops.length - 1}
                        style={arrowBtnStyle(i === drops.length - 1)}
                        aria-label="Move down"
                      >▼</button>
                      <button
                        type="button"
                        onClick={() => removeDrop(d.id)}
                        disabled={pending.has(d.id)}
                        style={removeBtnStyle}
                        aria-label="Remove"
                      >×</button>
                    </div>
                  )}
                </div>
              ))
            )}
          </MCard>
        </MSection>

      </div>
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────

function arrowBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 32, height: 32, borderRadius: 8,
    background: "var(--am-chip)", color: "var(--am-text)",
    border: "1px solid var(--am-border)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    fontSize: 11, lineHeight: 1,
    display: "flex", alignItems: "center", justifyContent: "center",
  };
}

const removeBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  background: "transparent", color: "var(--am-text-muted)",
  border: "1px solid var(--am-border)",
  cursor: "pointer", fontSize: 16, lineHeight: 1,
  display: "flex", alignItems: "center", justifyContent: "center",
};
