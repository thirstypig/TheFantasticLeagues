/**
 * /teams/:teamCode/wire-list — owner two-list view backed by /api/wire-list/*.
 *
 * Slice 1: view existing entries, reorder via up/down arrows, delete,
 *          change drop mode.
 * Slice 2: inline pickers (FA picker for adds, roster picker for drops).
 *
 * Read-only when period.status !== "PENDING" (LOCKED / PROCESSED).
 */
import { useParams, Link } from "react-router-dom";
import { useLeague } from "../../../contexts/LeagueContext";
import { Glass, SectionLabel, Chip } from "../../../components/aurora/atoms";
import { useWireListOwner } from "../hooks/useWireListOwner";
import { formatDeadline } from "../utils";
import { WireListRow } from "../components/WireListRow";
import { SlotEditor } from "../components/SlotEditor";
import AddPicker from "../components/AddPicker";
import DropPicker from "../components/DropPicker";
import type { SlotChange } from "@shared/api/rosterMoves";
import "../wireList.css";

// ─── Page ────────────────────────────────────────────────────────────

export default function WireListOwnerPage() {
  const { teamCode } = useParams<{ teamCode: string }>();
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
    rosterPlayers,
    saveAddSlotChanges,
    saveDropSlotChanges,
  } = useWireListOwner(leagueId, teamCode ?? "");

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

        <div className="wl-two-col">
          {/* Add list */}
          <Section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <SectionLabel>Add list · ranked top → bottom</SectionLabel>
              {!isReadOnly && !showAddPicker && (
                <button onClick={() => setShowAddPicker(true)} style={addBtnStyle}>+ Add player</button>
              )}
            </div>
            {showAddPicker && period && teamId !== null && leagueId && (
              <AddPicker
                periodId={period.id}
                teamId={teamId}
                leagueId={leagueId}
                excludePlayerIds={addPlayerIds}
                onAdded={() => { setShowAddPicker(false); reload(); }}
                onClose={() => setShowAddPicker(false)}
              />
            )}
            <div style={{ marginTop: 8 }}>
              {adds.length === 0 ? (
                <Empty>
                  No Adds yet.{" "}
                  {!isReadOnly && !showAddPicker && (
                    <button onClick={() => setShowAddPicker(true)} style={inlineLinkBtn}>Add a player →</button>
                  )}
                </Empty>
              ) : (
                adds.map((a, i) => (
                  <div key={a.id}>
                    <WireListRow
                      rank={a.priority}
                      playerName={a.player?.name ?? `#${a.playerId}`}
                      playerPos={a.player?.posPrimary ?? "—"}
                      playerTeam={a.player?.mlbTeam ?? "FA"}
                      isPending={pending.has(a.id)}
                      isReadOnly={isReadOnly}
                      compact={false}
                      isFirst={i === 0}
                      isLast={i === adds.length - 1}
                      onMoveUp={() => swapAddPriorities(i, -1)}
                      onMoveDown={() => swapAddPriorities(i, 1)}
                      onRemove={() => removeAdd(a.id)}
                    />
                    <SlotEditor
                      players={rosterPlayers.map((p) => ({
                        id: p.id,
                        name: p.name,
                        posList: p.posList,
                        currentSlot: p.assignedPosition ?? "BN",
                      }))}
                      value={(a.slotChanges ?? []) as SlotChange[]}
                      onChange={(changes) => saveAddSlotChanges(a.id, changes)}
                      disabled={isReadOnly || pending.has(a.id)}
                    />
                  </div>
                ))
              )}
            </div>
          </Section>

          {/* Drop list */}
          <Section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <SectionLabel>Drop list · top = drop first</SectionLabel>
              {!isReadOnly && !showDropPicker && (
                <button onClick={() => setShowDropPicker(true)} style={addBtnStyle}>+ Add drop</button>
              )}
            </div>
            {showDropPicker && period && teamId !== null && (
              <DropPicker
                periodId={period.id}
                teamId={teamId}
                excludePlayerIds={dropPlayerIds}
                onAdded={() => { setShowDropPicker(false); reload(); }}
                onClose={() => setShowDropPicker(false)}
              />
            )}
            <div style={{ marginTop: 8 }}>
              {drops.length === 0 ? (
                <Empty>
                  No Drops yet.{" "}
                  {!isReadOnly && !showDropPicker && (
                    <button onClick={() => setShowDropPicker(true)} style={inlineLinkBtn}>Pick from your roster →</button>
                  )}
                </Empty>
              ) : (
                drops.map((d, i) => (
                  <div key={d.id}>
                    <WireListRow
                      rank={d.priority}
                      playerName={d.player?.name ?? `#${d.playerId}`}
                      playerPos={d.player?.posPrimary ?? "—"}
                      playerTeam={d.player?.mlbTeam ?? "—"}
                      isPending={pending.has(d.id)}
                      isReadOnly={isReadOnly}
                      compact={false}
                      isFirst={i === 0}
                      isLast={i === drops.length - 1}
                      onMoveUp={() => swapDropPriorities(i, -1)}
                      onMoveDown={() => swapDropPriorities(i, 1)}
                      onRemove={() => removeDrop(d.id)}
                      dropMode={d.dropMode}
                      onDropModeChange={(m) => setDropMode(d.id, m)}
                    />
                    <SlotEditor
                      players={rosterPlayers.map((p) => ({
                        id: p.id,
                        name: p.name,
                        posList: p.posList,
                        currentSlot: p.assignedPosition ?? "BN",
                      }))}
                      excludePlayerId={d.playerId}
                      value={(d.slotChanges ?? []) as SlotChange[]}
                      onChange={(changes) => saveDropSlotChanges(d.id, changes)}
                      disabled={isReadOnly || pending.has(d.id)}
                    />
                  </div>
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

const btnStyle: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, fontSize: 13,
  background: "var(--am-chip)", color: "var(--am-text)",
  border: "1px solid var(--am-border)", cursor: "pointer",
};
const addBtnStyle: React.CSSProperties = {
  padding: "4px 10px", fontSize: 11, fontWeight: 600,
  borderRadius: 6, background: "var(--am-accent)",
  color: "var(--am-bg)", border: "none", cursor: "pointer",
};
const inlineLinkBtn: React.CSSProperties = {
  background: "none", border: "none", padding: 0,
  color: "var(--am-accent)", textDecoration: "underline",
  cursor: "pointer", font: "inherit",
};

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: "var(--am-surface)", border: "1px solid var(--am-border)",
    }}>{children}</div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "24px 8px", fontSize: 13, color: "var(--am-text-muted)", textAlign: "center" }}>
      {children}
    </div>
  );
}
