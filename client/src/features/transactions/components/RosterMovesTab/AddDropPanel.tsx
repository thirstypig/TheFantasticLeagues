import { useMemo, useState } from "react";
import { fetchJsonApi, API_BASE } from "../../../../api/base";
import { useLeague } from "../../../../contexts/LeagueContext";
import { Button } from "../../../../components/ui/button";
import { reportError } from "../../../../lib/errorBus";
import { slotsFor } from "../../../../lib/positionEligibility";
import type { RosterMovesPlayer } from "./types";

interface Props {
  leagueId: number;
  teamId: number;
  players: RosterMovesPlayer[];
  onComplete: () => void;
}

/**
 * Add/Drop panel — the default mode of the Roster Moves tab.
 *
 * In-season the server rejects a claim without a `dropPlayerId` (DROP_REQUIRED
 * invariant, plan Q1=b). This panel disables submit until a drop is picked,
 * with inline messaging — users see why they can't submit rather than
 * hitting a 400 after they try.
 *
 * The drop dropdown marks each candidate with whether the incoming free-agent
 * player can fill the drop's slot. Server still independently checks
 * position eligibility via `assertAddEligibleForDropSlot`.
 */
export default function AddDropPanel({ leagueId, teamId, players, onComplete }: Props) {
  const { seasonStatus } = useLeague();
  const inSeason = seasonStatus === "IN_SEASON";

  const [query, setQuery] = useState("");
  const [addPlayerId, setAddPlayerId] = useState<number | null>(null);
  const [dropPlayerId, setDropPlayerId] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Free-agent candidates: nobody currently rostered. Cap to 30 for layout.
  const freeAgents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter((p) => !(p.ogba_team_code || p.team))
      .filter((p) => !q || (p.player_name || p.name || "").toLowerCase().includes(q))
      .slice(0, 30);
  }, [players, query]);

  // Drop candidates: active roster only (not IL), and belongs to this team.
  const dropCandidates = useMemo(() => {
    return players.filter((p) => {
      const tid = p._dbTeamId;
      return tid === teamId && p.assignedPosition !== "IL" && (p._dbPlayerId ?? 0) > 0;
    });
  }, [players, teamId]);

  const selectedAdd = useMemo(
    () => freeAgents.find((p) => p._dbPlayerId === addPlayerId) ?? null,
    [freeAgents, addPlayerId],
  );
  const selectedDrop = useMemo(
    () => dropCandidates.find((p) => p._dbPlayerId === dropPlayerId) ?? null,
    [dropCandidates, dropPlayerId],
  );

  // "Can the add player fill the drop player's slot?" — same check the
  // server does. Eligibility warning is advisory; server has final say.
  const addSlots = useMemo(
    () => slotsFor(selectedAdd?.positions || selectedAdd?.posPrimary || ""),
    [selectedAdd],
  );
  const dropTargetSlot = selectedDrop?.assignedPosition || selectedDrop?.posPrimary || "UT";
  const slotCompatible = selectedDrop && addSlots.size > 0
    ? addSlots.has(dropTargetSlot as any)
    : true;

  const dropRequired = inSeason;
  const canSubmit =
    addPlayerId !== null &&
    (!dropRequired || dropPlayerId !== "") &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit || addPlayerId === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await fetchJsonApi(`${API_BASE}/transactions/claim`, {
        method: "POST",
        body: JSON.stringify({
          leagueId,
          teamId,
          playerId: addPlayerId,
          ...(dropPlayerId !== "" ? { dropPlayerId: Number(dropPlayerId) } : {}),
        }),
      });
      // Reset panel state so the next move starts clean.
      setAddPlayerId(null);
      setDropPlayerId("");
      setQuery("");
      onComplete();
    } catch (err: any) {
      const msg = err?.serverMessage || err?.message || "Add/Drop failed";
      setError(msg);
      reportError(err, { source: "roster-moves-add-drop" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[var(--lg-text-muted)]">
        Add a free agent to your team. In-season, every add must pair with a drop.
      </p>

      {/* Free-agent picker */}
      <div>
        <label className="block text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">
          Add player (free agents)
        </label>
        <input
          type="text"
          placeholder="Search by name…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setAddPlayerId(null); }}
          className="w-full mb-2 rounded border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)]"
        />
        <div className="max-h-60 overflow-y-auto rounded border border-[var(--lg-border-faint)]">
          {freeAgents.length === 0 ? (
            <div className="p-3 text-[11px] text-[var(--lg-text-muted)]">No matching free agents.</div>
          ) : (
            freeAgents.map((p) => {
              const pid = p._dbPlayerId ?? 0;
              const isSelected = pid === addPlayerId;
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => setAddPlayerId(pid)}
                  className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between border-b border-[var(--lg-border-faint)] ${
                    isSelected ? "bg-[var(--lg-accent)]/15 text-[var(--lg-text-primary)]" : "hover:bg-[var(--lg-tint)]"
                  }`}
                >
                  <span>{p.player_name || p.name}</span>
                  <span className="text-[10px] text-[var(--lg-text-muted)]">
                    {p.positions || p.posPrimary || "—"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Drop picker */}
      <div>
        <label className="block text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">
          Drop player{" "}
          <span className="text-[var(--lg-text-muted)]">
            ({dropRequired ? "required in-season" : "optional"})
          </span>
        </label>
        <select
          value={dropPlayerId}
          onChange={(e) => setDropPlayerId(e.target.value ? Number(e.target.value) : "")}
          className="w-full rounded border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)]"
        >
          <option value="">{dropRequired ? "Select a player to drop…" : "No drop (optional)"}</option>
          {dropCandidates.map((r) => {
            const targetSlot = r.assignedPosition || r.posPrimary || "UT";
            const addCovers = addSlots.size > 0 ? addSlots.has(targetSlot as any) : true;
            return (
              <option key={r._dbPlayerId} value={r._dbPlayerId}>
                {r.player_name || r.name} — {targetSlot}
                {selectedAdd && !addCovers ? " (incoming ineligible)" : ""}
              </option>
            );
          })}
        </select>
      </div>

      {/* Inline warnings */}
      {dropRequired && addPlayerId !== null && dropPlayerId === "" && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          In-season adds require a matching drop. Pick a player to drop to enable submit.
        </div>
      )}
      {selectedAdd && selectedDrop && !slotCompatible && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          {selectedAdd.player_name || selectedAdd.name} is not eligible for the{" "}
          {dropTargetSlot} slot. The server will reject this claim.
        </div>
      )}
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? "Submitting…" : dropPlayerId !== "" ? "Add + Drop" : "Add"}
        </Button>
      </div>
    </div>
  );
}
