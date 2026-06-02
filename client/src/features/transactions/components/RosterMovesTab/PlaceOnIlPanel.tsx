import { useEffect, useMemo, useState } from "react";
import { ilStash, previewIlStash } from "../../../transactions/api";
import { Button } from "../../../../components/ui/button";
import { reportError } from "../../../../lib/errorBus";
import { extractServerError } from "../../../../lib/extractServerError";
import { isSlotCode, slotsFor } from "../../../../lib/positionEligibility";
import { isMlbIlStatus } from "../../../../lib/mlbStatus";
import TransactionResultModal, { type TransactionResult } from "../TransactionResultModal";
import type { RosterMovesPlayer } from "./types";

interface Props {
  leagueId: number;
  teamId: number;
  players: RosterMovesPlayer[];
  onComplete: () => void;
  /**
   * YYYY-MM-DD, commissioner-only. When set, the stash is backdated to this
   * date; the server attributes stats from this date onward to the new owner.
   * Empty string or undefined = server default (tomorrow 12:00 AM PT).
   */
  effectiveDate?: string;
  /**
   * Optional preselected stash player (DB Player.id). Used by the per-row
   * "IL" shortcut from RosterGrid to skip the stash-player dropdown step.
   * Reapplied whenever the value changes (non-null) — switching the source
   * row replaces the preselection rather than ignoring later clicks.
   */
  initialStashPlayerId?: number | null;
}

/**
 * Place on IL — panel mode 2. Pick a player on your active roster whose MLB
 * status is a valid Injured-List designation, then pick a free-agent
 * replacement. Both halves commit atomically via /transactions/il-stash.
 *
 * Server enforces:
 *   - stashPlayer's current MLB status must match /^Injured (List )?\d+-Day$/
 *   - team has an open IL slot
 *   - replacement is position-eligible for stashPlayer's vacated slot
 *   - no ghost-IL blocking further stashes
 *
 * UI surfaces each of those as an inline amber warning before the user
 * submits, so they don't hit a 400 and have to re-read the error.
 */
export default function PlaceOnIlPanel({ leagueId, teamId, players, onComplete, effectiveDate, initialStashPlayerId }: Props) {
  const [stashPlayerId, setStashPlayerId] = useState<number | null>(initialStashPlayerId ?? null);
  const [txResult, setTxResult] = useState<TransactionResult | null>(null);
  const [query, setQuery] = useState("");
  const [addMlbId, setAddMlbId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-apply preselection whenever the parent passes a new non-null id —
  // a commissioner clicking IL on a different row should replace the
  // dropdown selection rather than be ignored.
  useEffect(() => {
    if (initialStashPlayerId != null) {
      setStashPlayerId(initialStashPlayerId);
    }
  }, [initialStashPlayerId]);

  // Stash candidates: this team's active roster, plus MLB-IL status. In
  // practice the server also accepts non-IL status and rejects with a
  // specific error, but we surface the warning up-front.
  const stashCandidates = useMemo(() => {
    return players.filter((p) => {
      const tid = p._dbTeamId;
      return tid === teamId && p.assignedPosition !== "IL" && (p._dbPlayerId ?? 0) > 0;
    });
  }, [players, teamId]);

  const stashPlayer = useMemo(
    () => stashCandidates.find((p) => p._dbPlayerId === stashPlayerId) ?? null,
    [stashCandidates, stashPlayerId],
  );
  const stashSlot = stashPlayer?.assignedPosition || stashPlayer?.posPrimary || "UT";
  const mlbStatusOk = stashPlayer
    ? !stashPlayer.mlbStatus || isMlbIlStatus(stashPlayer.mlbStatus)
    : true;

  // Free-agent pool for the replacement pick.
  const allFreeAgents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter((p) => !(p.ogba_team_code || p.team || p._dbTeamId))
      .filter((p) => !q || (p.player_name || p.name || "").toLowerCase().includes(q));
  }, [players, query]);
  const freeAgents = useMemo(() => {
    return allFreeAgents.slice(0, 30);
  }, [allFreeAgents]);

  const selectedAdd = useMemo(
    () => freeAgents.find((p) => Number(p.mlb_id ?? p.mlbId) === addMlbId) ?? null,
    [freeAgents, addMlbId],
  );
  const addEligibleForStashSlot = useMemo(() => {
    if (!selectedAdd) return true;
    if (!isSlotCode(stashSlot)) return false;
    return slotsFor(selectedAdd.positions || selectedAdd.posPrimary || "").has(stashSlot);
  }, [selectedAdd, stashSlot]);

  const selectedFieldsComplete = stashPlayerId !== null && addMlbId !== null;
  const needsServerPreview = selectedFieldsComplete && mlbStatusOk;
  const rosterRulesSatisfied =
    selectedFieldsComplete &&
    mlbStatusOk &&
    (needsServerPreview ? preview?.ok === true : (!selectedAdd || !stashPlayer || addEligibleForStashSlot));
  const canSubmit = rosterRulesSatisfied && !previewing && !submitting;

  useEffect(() => {
    setAddMlbId(null);
  }, [stashPlayerId]);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setPreviewing(false);
    if (!needsServerPreview || stashPlayerId === null || addMlbId === null) return;

    setPreviewing(true);
    previewIlStash({
      leagueId,
      teamId,
      stashPlayerId,
      addMlbId,
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
  }, [addMlbId, effectiveDate, leagueId, needsServerPreview, stashPlayerId, teamId]);

  async function handleSubmit() {
    if (!canSubmit || addMlbId === null || stashPlayerId === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await ilStash({
        leagueId,
        teamId,
        stashPlayerId: Number(stashPlayerId),
        addMlbId,
        ...(effectiveDate ? { effectiveDate } : {}),
      });
      const addName = selectedAdd?.player_name || selectedAdd?.name || "player";
      const stashedName = stashPlayer?.player_name || stashPlayer?.name || "player";
      const reassignments = response.appliedReassignments ?? [];
      const cascade = reassignments.filter(r =>
        r.playerId !== Number(stashPlayerId) && r.playerId !== Number(selectedAdd?._dbPlayerId ?? -1)
      );
      setTxResult({
        title: "IL stash complete",
        primaryLine: `Placed ${stashedName} on IL, added ${addName}.`,
        cascadeMoves: cascade,
      });
      setStashPlayerId(null);
      setAddMlbId(null);
      setQuery("");
      // onComplete deferred to modal dismiss.
    } catch (err: unknown) {
      setError(extractServerError(err, "IL stash failed"));
      reportError(err, { source: "roster-moves-place-il" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[var(--lg-text-muted)]">
        Move an injured player into an IL slot, then choose a replacement for the vacated active slot.
        Confirm unlocks only after the full roster can resolve legally.
      </p>

      {/* Stash player picker */}
      <div>
        <label className="block text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">
          Player to place on IL
        </label>
        <select
          value={stashPlayerId ?? ""}
          onChange={(e) => setStashPlayerId(e.target.value ? Number(e.target.value) : null)}
          className="w-full rounded border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)]"
        >
          <option value="">Select a player…</option>
          {stashCandidates.map((r) => (
            <option key={r._dbPlayerId} value={r._dbPlayerId}>
              {r.player_name || r.name} — {r.assignedPosition || r.posPrimary || "UT"}
              {r.mlbStatus && !isMlbIlStatus(r.mlbStatus) ? " (not MLB-IL)" : ""}
            </option>
          ))}
        </select>
      </div>

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
          ? preview?.message || "Roster rules satisfied. Confirm to place this player on IL and add the replacement."
          : preview?.error || "Confirm unlocks after the IL move satisfies roster rules."}
      </div>

      {stashPlayer && !mlbStatusOk && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          MLB status is "{stashPlayer.mlbStatus}". The player must have an active Injured-List designation.
        </div>
      )}

      {/* Free-agent replacement */}
      <div>
        <label className="block text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">
          Replacement (free agents)
          {stashPlayer && (
            <span className="text-[var(--lg-text-muted)]">
              {" "}— eligible to fill the vacated{" "}
              <span className="text-[var(--lg-accent)] font-mono">{stashSlot}</span> slot
            </span>
          )}
        </label>
        <input
          type="text"
          placeholder="Search by name…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setAddMlbId(null); }}
          className="w-full mb-2 rounded border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)]"
        />
        <div className="max-h-60 overflow-y-auto rounded border border-[var(--lg-border-faint)]">
          {freeAgents.length === 0 ? (
            <div className="p-3 text-[11px] text-[var(--lg-text-muted)]">
              No matching free agents.
            </div>
          ) : (
            freeAgents.map((p) => {
              const mid = Number(p.mlb_id ?? p.mlbId ?? 0);
              const isSelected = mid === addMlbId;
              const direct = stashPlayer
                ? isSlotCode(stashSlot) && slotsFor(p.positions || p.posPrimary || "").has(stashSlot)
                : true;
              return (
                <button
                  key={mid}
                  type="button"
                  onClick={() => setAddMlbId(mid)}
                  className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between border-b border-[var(--lg-border-faint)] ${
                    isSelected ? "bg-[var(--lg-accent)]/15 text-[var(--lg-text-primary)]" : "hover:bg-[var(--lg-tint)]"
                  }`}
                >
                  <span>{p.player_name || p.name}</span>
                  <span className="flex items-center gap-2 text-[10px] text-[var(--lg-text-muted)]">
                    <span>{p.positions || p.posPrimary || "—"}</span>
                    {stashPlayer && (
                      <span className={direct ? "text-emerald-400" : "text-amber-300"}>
                        {direct ? `fits ${stashSlot}` : "needs reshuffle"}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {selectedAdd && stashPlayer && !addEligibleForStashSlot && !needsServerPreview && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          {selectedAdd.player_name || selectedAdd.name} is not eligible for the {stashSlot} slot. Pick a different replacement.
        </div>
      )}
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={submitting}
          onClick={() => {
            setStashPlayerId(null);
            setAddMlbId(null);
            setQuery("");
            setError(null);
          }}
        >
          Reset
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? "Stashing…" : "Confirm Stash + Add"}
        </Button>
      </div>

      <TransactionResultModal
        result={txResult}
        onClose={() => {
          setTxResult(null);
          onComplete();
        }}
      />
    </div>
  );
}
