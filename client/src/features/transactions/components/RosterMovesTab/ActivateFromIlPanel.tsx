import { useEffect, useMemo, useState } from "react";
import { ilActivate, previewIlActivate, formatReassignmentsToast } from "../../../transactions/api";
import { Button } from "../../../../components/ui/button";
import { useToast } from "../../../../contexts/ToastContext";
import { reportError } from "../../../../lib/errorBus";
import { extractServerError } from "../../../../lib/extractServerError";
import { isSlotCode, slotsFor } from "../../../../lib/positionEligibility";
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
  const [targetSlot, setTargetSlot] = useState<string | null>(null);
  const [dropPlayerId, setDropPlayerId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
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
  const occupiedSlots = useMemo(() => {
    const slots = new Set<string>();
    for (const p of dropCandidates) {
      const slot = p.assignedPosition || p.posPrimary || "UT";
      if (slot && slot !== "IL") slots.add(slot);
    }
    return Array.from(slots).sort((a, b) => slotSort(a) - slotSort(b));
  }, [dropCandidates]);
  const filteredDropCandidates = useMemo(() => {
    if (!targetSlot) return [] as RosterMovesPlayer[];
    return dropCandidates.filter((p) => (p.assignedPosition || p.posPrimary || "UT") === targetSlot);
  }, [dropCandidates, targetSlot]);

  const dropTargetSlot = selectedDrop?.assignedPosition || selectedDrop?.posPrimary || "UT";
  const slotCompatible = selectedDrop && activatePlayer
    ? isSlotCode(dropTargetSlot) && activateSlots.has(dropTargetSlot)
    : true;

  const selectedFieldsComplete = activatePlayerId !== null && targetSlot !== null && dropPlayerId !== null;
  const needsServerPreview = selectedFieldsComplete;
  const rosterRulesSatisfied =
    selectedFieldsComplete &&
    (needsServerPreview ? preview?.ok === true : (!selectedDrop || !activatePlayer || slotCompatible));
  const canSubmit = rosterRulesSatisfied && !previewing && !submitting;

  useEffect(() => {
    setDropPlayerId(null);
    if (!activatePlayer) {
      setTargetSlot(null);
      return;
    }
    setTargetSlot((current) => {
      if (current && occupiedSlots.includes(current)) return current;
      return occupiedSlots[0] ?? null;
    });
  }, [activatePlayer, occupiedSlots]);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setPreviewing(false);
    if (!needsServerPreview || activatePlayerId === null || dropPlayerId === null) return;

    setPreviewing(true);
    previewIlActivate({
      leagueId,
      teamId,
      activatePlayerId,
      dropPlayerId,
      ...(effectiveDate ? { effectiveDate } : {}),
    })
      .then((result) => {
        if (!cancelled) setPreview({ ok: result.ok, message: result.message });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPreview({
            ok: false,
            error: extractServerError(err, "Roster rules are not satisfied."),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activatePlayerId, dropPlayerId, effectiveDate, leagueId, needsServerPreview, teamId]);

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
    } catch (err: unknown) {
      setError(extractServerError(err, "Activate failed"));
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
        Bring a player back from IL, choose the active slot they will reclaim, then click the player to drop.
        Confirm unlocks only after the full roster can resolve legally.
      </p>

      <div
        className={`rounded border p-2 text-[11px] ${
          rosterRulesSatisfied
            ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
            : "border-[var(--lg-border-faint)] bg-[var(--lg-tint)]/50 text-[var(--lg-text-muted)]"
        }`}
      >
        {previewing
          ? "Checking roster rules..."
          : rosterRulesSatisfied
          ? preview?.message || "Roster rules satisfied. Confirm to activate this player and drop the replacement."
          : preview?.error || "Confirm unlocks after the activation satisfies roster rules."}
      </div>

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
        {targetSlot && filteredDropCandidates.length > 0 && (
          <div className="mt-2 rounded border border-[var(--lg-border-faint)] bg-[var(--lg-tint)]/25 p-2">
            <div className="mb-2 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">
              Players in {targetSlot}
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {filteredDropCandidates.map((r) => {
                const selected = r._dbPlayerId === dropPlayerId;
                return (
                  <button
                    key={`activate-drop-card-${r._dbPlayerId}`}
                    type="button"
                    onClick={() => { setDropPlayerId(r._dbPlayerId ?? null); setError(null); }}
                    className={`rounded border px-3 py-2 text-left text-[11px] ${
                      selected
                        ? "border-[var(--lg-accent)] bg-[var(--lg-accent)]/15 text-[var(--lg-text-primary)]"
                        : "border-[var(--lg-border-faint)] bg-[var(--lg-bg-surface)] text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{r.player_name || r.name}</span>
                      <span className="font-mono text-[10px] text-[var(--lg-text-muted)]">{targetSlot}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--lg-text-muted)]">
                      Eligible: {r.positions || r.posPrimary || "-"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Drop picker */}
      <div>
        <label className="block text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">
          Active slot to reclaim
        </label>
        <div className="mb-2 rounded border border-[var(--lg-border-faint)] bg-[var(--lg-tint)]/35 p-2">
          {!activatePlayer ? (
            <div className="text-[11px] text-[var(--lg-text-muted)]">Select an IL player first to see eligible active slots.</div>
          ) : occupiedSlots.length === 0 ? (
            <div className="text-[11px] text-amber-300">
              This roster has no active slot available to reclaim.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {occupiedSlots.map((slot) => {
                const count = dropCandidates.filter((p) => (p.assignedPosition || p.posPrimary || "UT") === slot).length;
                const active = targetSlot === slot;
                const direct = isSlotCode(slot) && activateSlots.has(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => { setTargetSlot(slot); setDropPlayerId(null); }}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                      active
                        ? "border-[var(--lg-accent)] bg-[var(--lg-accent)]/15 text-[var(--lg-text-primary)]"
                        : "border-[var(--lg-border-faint)] bg-[var(--lg-tint)] text-[var(--lg-text-muted)] hover:bg-[var(--lg-tint-hover)]"
                    }`}
                  >
                    {slot} <span className="font-normal opacity-70">({count})</span>
                    {!direct && <span className="ml-1 font-normal opacity-70">reshuffle</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <label className="block text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">
          Drop player from {targetSlot ?? "selected slot"}
        </label>
        <select
          value={dropPlayerId ?? ""}
          onChange={(e) => { setDropPlayerId(e.target.value ? Number(e.target.value) : null); setError(null); }}
          className="w-full rounded border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)]"
          disabled={activatePlayerId === null || targetSlot === null}
        >
          <option value="">
            {activatePlayerId === null
              ? "Select an IL player first…"
              : targetSlot === null
              ? "Select an active slot first…"
              : `Select a ${targetSlot} player to drop…`}
          </option>
          {filteredDropCandidates.map((r) => {
            const targetSlot = r.assignedPosition || r.posPrimary || "UT";
            const fits = activatePlayer
              ? isSlotCode(targetSlot) && activateSlots.has(targetSlot)
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

      {selectedDrop && activatePlayer && !slotCompatible && !needsServerPreview && (
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
          {submitting ? "Activating…" : "Confirm Activate + Drop"}
        </Button>
      </div>
    </div>
  );
}

const SLOT_ORDER = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P", "SP", "RP"];

function slotSort(slot: string): number {
  const idx = SLOT_ORDER.indexOf(slot);
  return idx >= 0 ? idx : 99;
}
