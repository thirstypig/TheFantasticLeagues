/**
 * Mobile twin of WireListOwnerPage — /teams/:code/wire-list on narrow viewports.
 *
 * Data-fetching logic lives in useWireListOwner (shared with WireListOwnerPage).
 * UI uses Aurora mobile atoms instead of Glass.
 *
 * teamCode is received as a prop (parsed from pathname in MobileShell.pickMobilePage)
 * rather than via useParams, because this component renders outside any
 * React Router <Route> match context — useParams would return {}.
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { useLeague } from "../../contexts/LeagueContext";
import { useWireListOwner } from "../../features/wire-list/hooks/useWireListOwner";
import { formatDeadline } from "../../features/wire-list/utils";
import { WireListRow } from "../../features/wire-list/components/WireListRow";
import AddPicker from "../../features/wire-list/components/AddPicker";
import DropPicker from "../../features/wire-list/components/DropPicker";
import { MobileTopbar } from "../MobileTopbar";
import { MCard, MSection, MLabel } from "../atoms/MCard";
import { Glyph } from "../atoms/Glyph";

// ─── Props ───────────────────────────────────────────────────────────

interface MobileWireListProps {
  teamCode: string;
}

// ─── Page ────────────────────────────────────────────────────────────

export function MobileWireList({ teamCode }: MobileWireListProps) {
  const nav = useNavigate();
  const { leagueId } = useLeague();

  const {
    teamId,
    period,
    adds,
    drops,
    loading,
    error,
    pending,
    isReadOnly,
    addPlayerIds,
    dropPlayerIds,
    showAddPicker,
    setShowAddPicker,
    showDropPicker,
    setShowDropPicker,
    reload,
    swapAddPriorities,
    swapDropPriorities,
    removeAdd,
    removeDrop,
    setDropMode,
  } = useWireListOwner(leagueId, teamCode);

  // ─── Topbar (hoisted so all branches share it) ────────────────────

  const topbar = (
    <MobileTopbar
      title="Wire List"
      subtitle={
        loading ? "Waiver picks" :
        error ? "Waiver picks" :
        !period ? "Waiver picks" :
        isReadOnly ? "Read only" :
        `Locks ${formatDeadline(period.deadlineAt)}`
      }
      leading={<Glyph kind="back" size={20} />}
      onLeadingClick={() => nav(-1)}
      trailing={period && !loading && !error ? <Glyph kind="moreDots" size={20} /> : undefined}
    />
  );

  // ─── Loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div data-testid="mobile-wire-list">
        {topbar}
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
        {topbar}
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
        {topbar}
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
      {topbar}

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
                <WireListRow
                  key={a.id}
                  rank={a.priority}
                  playerName={a.player?.name ?? `#${a.playerId}`}
                  playerPos={a.player?.posPrimary ?? "—"}
                  playerTeam={a.player?.mlbTeam ?? "FA"}
                  isPending={pending.has(a.id)}
                  isReadOnly={isReadOnly}
                  compact={true}
                  isFirst={i === 0}
                  isLast={i === adds.length - 1}
                  onMoveUp={() => swapAddPriorities(i, -1)}
                  onMoveDown={() => swapAddPriorities(i, 1)}
                  onRemove={() => removeAdd(a.id)}
                />
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
                <WireListRow
                  key={d.id}
                  rank={d.priority}
                  playerName={d.player?.name ?? `#${d.playerId}`}
                  playerPos={d.player?.posPrimary ?? "—"}
                  playerTeam={d.player?.mlbTeam ?? "—"}
                  isPending={pending.has(d.id)}
                  isReadOnly={isReadOnly}
                  compact={true}
                  isFirst={i === 0}
                  isLast={i === drops.length - 1}
                  onMoveUp={() => swapDropPriorities(i, -1)}
                  onMoveDown={() => swapDropPriorities(i, 1)}
                  onRemove={() => removeDrop(d.id)}
                  dropMode={d.dropMode}
                  onDropModeChange={(m) => setDropMode(d.id, m)}
                />
              ))
            )}
          </MCard>
        </MSection>

      </div>
    </div>
  );
}
