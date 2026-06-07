import { useMemo, useState } from "react";
import { drop } from "../../../transactions/api";
import { Button } from "../../../../components/ui/button";
import { extractServerError } from "../../../../lib/extractServerError";
import type { RosterMovesPlayer } from "./types";

interface Props {
  leagueId: number;
  teamId: number;
  players: RosterMovesPlayer[];
  onComplete: () => void;
  /** YYYY-MM-DD, commissioner-only. When set, the drop is backdated. */
  effectiveDate?: string;
  /** DB Player.id of the IL player to pre-select. */
  initialReleasePlayerId?: number | null;
}

/**
 * Release from IL — confirm panel. Pick an IL-slotted player and release them
 * outright. No active slot is touched (IL players are outside the active cap).
 * POSTs directly to /transactions/drop, which already allows IL drops.
 */
export default function DropFromIlPanel({
  leagueId,
  teamId,
  players,
  onComplete,
  effectiveDate,
  initialReleasePlayerId,
}: Props) {
  const [releasePlayerId, setReleasePlayerId] = useState<number | "">(
    initialReleasePlayerId ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ilPlayers = useMemo(
    () =>
      players.filter(
        (p) =>
          p._dbTeamId === teamId &&
          p.assignedPosition === "IL" &&
          (p._dbPlayerId ?? 0) > 0
      ),
    [players, teamId]
  );

  const selectedPlayer = useMemo(
    () => ilPlayers.find((p) => p._dbPlayerId === releasePlayerId) ?? null,
    [ilPlayers, releasePlayerId]
  );

  const canSubmit = releasePlayerId !== "" && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await drop({
        leagueId,
        teamId,
        playerId: Number(releasePlayerId),
        ...(effectiveDate ? { effectiveDate } : {}),
      });
      onComplete();
    } catch (err) {
      setError(extractServerError(err, "Release failed — please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="dfi-player-select" className="block text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">
          Player on IL
        </label>
        <select
          id="dfi-player-select"
          value={releasePlayerId}
          onChange={(e) =>
            setReleasePlayerId(e.target.value === "" ? "" : Number(e.target.value))
          }
          disabled={submitting}
          className="w-full rounded border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)]"
        >
          <option value="">— select player —</option>
          {ilPlayers.map((p) => (
            <option key={p._dbPlayerId} value={p._dbPlayerId!}>
              {p.player_name}
            </option>
          ))}
        </select>
      </div>

      {selectedPlayer && (
        <p className="text-[11px] text-[var(--lg-text-muted)]">
          Releasing <strong>{selectedPlayer.player_name}</strong> from the IL slot will remove
          them from your roster entirely. This cannot be undone.
        </p>
      )}

      {error && (
        <div role="alert" className="rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end mt-3">
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? "Releasing…" : "Release from IL"}
        </Button>
      </div>
    </div>
  );
}
