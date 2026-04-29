import { useEffect, useMemo, useState } from "react";
import { ilActivate, formatReassignmentsToast } from "../../../transactions/api";
import { Button } from "../../../../components/ui/button";
import { useToast } from "../../../../contexts/ToastContext";
import { reportError } from "../../../../lib/errorBus";
import { slotsFor } from "../../../../lib/positionEligibility";
import type { RosterMovesPlayer } from "./types";

interface Props {
  leagueId: number;
  teamId: number;
  players: RosterMovesPlayer[];
  onComplete: () => void;
  /**
   * YYYY-MM-DD, commissioner-only. When set, the activate+drop is backdated
   * to this date. Empty string or undefined = server default.
   */
  effectiveDate?: string;
  /**
   * Optional preselected activate player (DB Player.id) — used by the
   * per-row "Activate" shortcut from RosterGrid to skip the IL-player
   * dropdown. Reapplied whenever the value changes (non-null).
   */
  initialActivatePlayerId?: number | null;
}

/**
 * Activate from IL — panel mode 3. Pick a player currently in the team's IL
 * slot, then pick a drop target. The drop frees an active-roster slot; the
 * activated player inherits that slot. Both halves commit atomically via
 * /transactions/il-activate.
 *
 * Drop-dropdown eligibility: the ACTIVATING player must be able to fill the
 * DROP target's slot (that's the slot the activated player takes over). So
 * the eligibility check here is the MIRROR of PlaceOnIlPanel — same helper,
 * different direction.
 */
export default function ActivateFromIlPanel({ leagueId, teamId, players, onComplete, effectiveDate, initialActivatePlayerId }: Props) {
  const { toast } = useToast();
  const [activatePlayerId, setActivatePlayerId] = useState<number | null>(initialActivatePlayerId ?? null);
  const [dropPlayerId, setDropPlayerId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialActivatePlayerId != null) {
      setActivatePlayerId(initialActivatePlayerId);
    }
  }, [initialActivatePlayerId]);

  // IL-slotted players on this team.
  const ilPlayers = useMemo(() => {
    return players.filter((p) => {
      const tid = p._dbTeamId;
      return tid === teamId && p.assignedPosition === "IL" && (p._dbPlayerId ?? 0) > 0;
    });
  }, [players, teamId]);

  // Drop candidates: active (non-IL) roster members on this team.
  const dropCandidates = useMemo(() => {
    return players.filter((p) => {
      const tid = p._dbTeamId;
      return tid === teamId && p.assignedPosition !== "IL" && (p._dbPlayerId ?? 0) > 0;
    });
  }, [players, teamId]);

  const activatePlayer = useMemo(
    () => ilPlayers.find((p) => p._dbPlayerId === activatePlayerId) ?? null,
    [ilPlayers, activatePlayerId],
  );
  const selectedDrop = useMemo(
    () => dropCandidates.find((p) => p._dbPlayerId === dropPlayerId) ?? null,
    [dropCandidates, dropPlayerId],
  );

  // Which slots can the activating player fill?
  const activateSlots = useMemo(
    () => slotsFor(activatePlayer?.positions || activatePlayer?.posPrimary || ""),
    [activatePlayer],
  );

  const dropTargetSlot = selectedDrop?.assignedPosition || selectedDrop?.posPrimary || "UT";
  const slotCompatible = selectedDrop && activatePlayer
    ? activateSlots.has(dropTargetSlot as any)
    : true;

  const canSubmit = activatePlayerId !== null && dropPlayerId !== null && !submitting;

  async function handleSubmit() {
    if (!canSubmit || activatePlayerId === null || dropPlayerId === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await ilActivate({
        leagueId,
        teamId,
        activatePlayerId: Number(activatePlayerId),
        dropPlayerId: Number(dropPlayerId),
        ...(effectiveDate ? { effectiveDate } : {}),
      });
      const activateName = activatePlayer?.player_name || activatePlayer?.name || "player";
      const toastMsg = formatReassignmentsToast(
        response.appliedReassignments,
        `Activated ${activateName}.`,
      );
      if (toastMsg) toast(toastMsg, "success");
      setActivatePlayerId(null);
      setDropPlayerId(null);
      onComplete();
    } catch (err: any) {
      const msg = err?.serverMessage || err?.message || "Activate failed";
      setError(msg);
      reportError(err, { source: "roster-moves-activate-il" });
    } finally {
      setSubmitting(false);
    }
  }

  if (ilPlayers.length === 0) {
    return (
      <div className="rounded border border-[var(--lg-border-faint)] bg-[var(--lg-tint)]/40 p-6 text-center">
        <p className="text-[11px] text-[var(--lg-text-muted)]">
          No players currently on IL. Place a player on IL from the Place on IL mode first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[var(--lg-text-muted)]">
        Bring a player back from IL. Pick who to activate, then pick the roster player to drop to make room.
      </p>

      {/* IL-slotted player picker */}
      <div>
        <label className="block text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">
          Player to activate from IL
        </label>
        <select
          value={activatePlayerId ?? ""}
          onChange={(e) => { setActivatePlayerId(e.target.value ? Number(e.target.value) : null); setError(null); }}
          className="w-full rounded border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)]"
        >
          <option value="">Select an IL-slotted player…</option>
          {ilPlayers.map((p) => (
            <option key={p._dbPlayerId} value={p._dbPlayerId}>
              {p.player_name || p.name} — {p.positions || p.posPrimary || "—"}
            </option>
          ))}
        </select>
      </div>

      {/* Drop picker */}
      <div>
        <label className="block text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">
          Drop player
        </label>
        <select
          value={dropPlayerId ?? ""}
          onChange={(e) => { setDropPlayerId(e.target.value ? Number(e.target.value) : null); setError(null); }}
          className="w-full rounded border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)]"
          disabled={activatePlayerId === null}
        >
          <option value="">
            {activatePlayerId === null ? "Select an IL player first…" : "Select a player to drop…"}
          </option>
          {dropCandidates.map((r) => {
            const targetSlot = r.assignedPosition || r.posPrimary || "UT";
            const fits = activatePlayer
              ? activateSlots.has(targetSlot as any)
              : true;
            return (
              <option key={r._dbPlayerId} value={r._dbPlayerId}>
                {r.player_name || r.name} — {targetSlot}
                {activatePlayer && !fits ? " (ineligible)" : ""}
              </option>
            );
          })}
        </select>
      </div>

      {selectedDrop && activatePlayer && !slotCompatible && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          {activatePlayer.player_name || activatePlayer.name} is not eligible for the{" "}
          {dropTargetSlot} slot. Pick a different drop player.
        </div>
      )}
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? "Activating…" : "Activate + Drop"}
        </Button>
      </div>
    </div>
  );
}
