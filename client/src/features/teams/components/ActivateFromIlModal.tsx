import { useMemo, useState } from "react";
import { ilActivate } from "../../transactions/api";
import { positionToSlots } from "../../../lib/sportConfig";
import { Button } from "../../../components/ui/button";
import { reportError } from "../../../lib/errorBus";

interface RosterRow {
  player_name?: string;
  name?: string;
  _dbPlayerId?: number;
  assignedPosition?: string;
  posPrimary?: string;
  positions?: string;
}

interface Props {
  leagueId: number;
  teamId: number;
  activatePlayer: RosterRow;
  activeRoster: RosterRow[];
  onClose: () => void;
  onSuccess: () => void;
}

function slotsFor(posList: string): Set<string> {
  const slots = new Set<string>();
  for (const p of (posList || "").split(/[,/| ]+/).map(s => s.trim()).filter(Boolean)) {
    for (const s of positionToSlots(p)) slots.add(s);
  }
  return slots;
}

export default function ActivateFromIlModal({ leagueId, teamId, activatePlayer, activeRoster, onClose, onSuccess }: Props) {
  const [dropPlayerId, setDropPlayerId] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dropCandidates = useMemo(
    () => activeRoster.filter(r => r.assignedPosition !== "IL" && (r._dbPlayerId ?? 0) > 0),
    [activeRoster],
  );

  const selectedDrop = useMemo(
    () => dropCandidates.find(r => r._dbPlayerId === dropPlayerId) ?? null,
    [dropCandidates, dropPlayerId],
  );

  const activateSlots = useMemo(
    () => slotsFor(activatePlayer.positions || activatePlayer.posPrimary || ""),
    [activatePlayer],
  );

  const eligible = useMemo(() => {
    if (!selectedDrop) return true;
    const targetSlot = selectedDrop.assignedPosition || selectedDrop.posPrimary || "UT";
    return activateSlots.has(targetSlot);
  }, [selectedDrop, activateSlots]);

  const handleSubmit = async () => {
    if (!dropPlayerId || !activatePlayer._dbPlayerId) return;
    setSubmitting(true);
    setError(null);
    try {
      await ilActivate({
        leagueId,
        teamId,
        activatePlayerId: activatePlayer._dbPlayerId,
        dropPlayerId: Number(dropPlayerId),
      });
      onSuccess();
    } catch (err: any) {
      const msg = err?.serverMessage || err?.message || "Activate failed";
      setError(msg);
      reportError(err, { source: "il-activate" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold uppercase text-[var(--lg-text-heading)] mb-1">Activate From IL</h2>
        <p className="text-[11px] text-[var(--lg-text-muted)] mb-4">
          Moves <span className="text-[var(--lg-text-primary)] font-semibold">{activatePlayer.player_name || activatePlayer.name}</span> back to
          the active roster and drops the selected player in one transaction.
        </p>

        <label className="block text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">Drop player</label>
        <select
          autoFocus
          value={dropPlayerId}
          onChange={e => setDropPlayerId(e.target.value ? Number(e.target.value) : "")}
          className="w-full rounded border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)]"
        >
          <option value="">Select a player to drop…</option>
          {dropCandidates.map(r => {
            const targetSlot = r.assignedPosition || r.posPrimary || "UT";
            const fits = activateSlots.has(targetSlot);
            return (
              <option key={r._dbPlayerId} value={r._dbPlayerId}>
                {r.player_name || r.name} — {targetSlot}{fits ? "" : " (ineligible)"}
              </option>
            );
          })}
        </select>

        {selectedDrop && !eligible && (
          <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
            {activatePlayer.player_name || activatePlayer.name} is not eligible for the{" "}
            {selectedDrop.assignedPosition || selectedDrop.posPrimary} slot. Pick a different drop player.
          </div>
        )}

        {error && (
          <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-300">{error}</div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!dropPlayerId || submitting}>
            {submitting ? "Activating…" : "Activate + Drop"}
          </Button>
        </div>
      </div>
    </div>
  );
}
