import { useMemo, useState } from "react";
import { ilStash } from "../../transactions/api";
import { positionToSlots } from "../../../lib/sportConfig";
import { isMlbIlStatus } from "../../../lib/mlbStatus";
import { Button } from "../../../components/ui/button";
import { reportError } from "../../../lib/errorBus";

interface StashCandidate {
  player_name?: string;
  name?: string;
  mlb_id?: string | number;
  mlbId?: string | number;
  _dbPlayerId?: number;
  assignedPosition?: string;
  posPrimary?: string;
  positions?: string;
  mlbStatus?: string;
}

interface FreeAgent {
  player_name?: string;
  name?: string;
  mlb_id?: string | number;
  mlbId?: string | number;
  _dbPlayerId?: number;
  positions?: string;
  posPrimary?: string;
  ogba_team_code?: string;
  team?: string;
  is_pitcher?: boolean | number;
}

interface Props {
  leagueId: number;
  teamId: number;
  stashPlayer: StashCandidate;
  playerPool: FreeAgent[];
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

export default function PlaceOnIlModal({ leagueId, teamId, stashPlayer, playerPool, onClose, onSuccess }: Props) {
  const stashSlot = stashPlayer.assignedPosition || stashPlayer.posPrimary || "UT";
  const [query, setQuery] = useState("");
  const [selectedMlbId, setSelectedMlbId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const freeAgents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return playerPool
      .filter(p => !(p.ogba_team_code || p.team))
      .filter(p => !q || (p.player_name || p.name || "").toLowerCase().includes(q))
      .slice(0, 30);
  }, [playerPool, query]);

  const selected = useMemo(
    () => freeAgents.find(p => Number(p.mlb_id ?? p.mlbId) === selectedMlbId) ?? null,
    [freeAgents, selectedMlbId],
  );

  const eligible = useMemo(() => {
    if (!selected) return true;
    return slotsFor(selected.positions || selected.posPrimary || "").has(stashSlot);
  }, [selected, stashSlot]);

  const handleSubmit = async () => {
    if (!selectedMlbId) return;
    setSubmitting(true);
    setError(null);
    try {
      await ilStash({
        leagueId,
        teamId,
        stashPlayerId: Number(stashPlayer._dbPlayerId ?? 0),
        addMlbId: selectedMlbId,
      });
      onSuccess();
    } catch (err: any) {
      const msg = err?.serverMessage || err?.message || "IL stash failed";
      setError(msg);
      reportError(err, { source: "il-stash" });
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
        <h2 className="text-base font-semibold uppercase text-[var(--lg-text-heading)] mb-1">Place on IL</h2>
        <p className="text-[11px] text-[var(--lg-text-muted)] mb-4">
          Moves <span className="text-[var(--lg-text-primary)] font-semibold">{stashPlayer.player_name || stashPlayer.name}</span> to the IL slot and
          adds a replacement into the vacated <span className="text-[var(--lg-accent)] font-mono">{stashSlot}</span> slot. Both happen atomically.
        </p>

        {stashPlayer.mlbStatus && !isMlbIlStatus(stashPlayer.mlbStatus) && (
          <div className="mb-3 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
            MLB status is "{stashPlayer.mlbStatus}". The server requires an active Injured-List designation and will reject this stash.
          </div>
        )}

        <label className="block text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">Replacement (free agents)</label>
        <input
          type="text"
          autoFocus
          placeholder="Search by name…"
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedMlbId(null); }}
          className="w-full mb-2 rounded border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-3 py-2 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)]"
        />

        <div className="max-h-60 overflow-y-auto rounded border border-[var(--lg-border-faint)]">
          {freeAgents.length === 0 ? (
            <div className="p-3 text-[11px] text-[var(--lg-text-muted)]">No matching free agents.</div>
          ) : freeAgents.map((p) => {
            const mid = Number(p.mlb_id ?? p.mlbId ?? 0);
            const isSelected = mid === selectedMlbId;
            const slots = slotsFor(p.positions || p.posPrimary || "");
            const fits = slots.has(stashSlot);
            return (
              <button
                key={mid}
                type="button"
                onClick={() => setSelectedMlbId(mid)}
                className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between border-b border-[var(--lg-border-faint)] ${
                  isSelected ? "bg-[var(--lg-accent)]/15 text-[var(--lg-text-primary)]" : "hover:bg-[var(--lg-tint)]"
                }`}
              >
                <span>{p.player_name || p.name}</span>
                <span className="flex items-center gap-2 text-[10px] text-[var(--lg-text-muted)]">
                  <span>{p.positions || p.posPrimary || "—"}</span>
                  {!fits && <span className="text-amber-400">not eligible for {stashSlot}</span>}
                </span>
              </button>
            );
          })}
        </div>

        {selected && !eligible && (
          <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
            {selected.player_name || selected.name} is not eligible for the {stashSlot} slot. The server will reject this stash.
          </div>
        )}

        {error && (
          <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-300">{error}</div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!selectedMlbId || submitting}>
            {submitting ? "Stashing…" : "Stash + Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}
