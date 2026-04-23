import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../../../components/ui/button";
import AddDropPanel from "./AddDropPanel";
import PlaceOnIlPanel from "./PlaceOnIlPanel";
import ActivateFromIlPanel from "./ActivateFromIlPanel";
import { MODES, MODE_LABEL, type RosterMovesMode, type RosterMovesPlayer } from "./types";

interface Props {
  leagueId: number;
  teamId: number;
  players: RosterMovesPlayer[];
  onComplete: () => void;
}

/**
 * RosterMovesTab — one tab inside the Activity page where all in-season
 * roster mutations happen. Replaces the old PlaceOnIlModal /
 * ActivateFromIlModal / AddDropTab trio; consolidates them into three
 * panel modes under a single in-page mode selector. URL-synced via
 * `?tab=roster_moves&mode=...` so links are shareable and back/forward
 * navigation between modes works.
 *
 * Mode switch clears in-panel state: each panel unmounts when inactive,
 * so the user never ends up with a half-filled Add/Drop form leaking into
 * a Place on IL submit. The page-level team selector (owned by ActivityPage)
 * persists across mode switches — that's intentional, mode is a
 * function-choice, team is a context that spans all three.
 */
export default function RosterMovesTab({ leagueId, teamId, players, onComplete }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawMode = searchParams.get("mode");
  const mode: RosterMovesMode = MODES.includes(rawMode as RosterMovesMode)
    ? (rawMode as RosterMovesMode)
    : "add-drop";

  const setMode = (next: RosterMovesMode) => {
    // Preserve the parent tab param (`?tab=roster_moves`) alongside the
    // mode. replace:false so history push works — users can back-button.
    const params = new URLSearchParams(searchParams);
    params.set("mode", next);
    setSearchParams(params);
  };

  // Count for the Activate tab label — shows "Activate from IL · 2" when
  // the team has stashed players. Surfaces the call-to-action without
  // auto-switching the active mode (NN/g's "default to the majority action"
  // rule — most roster moves are adds, not activations).
  const ilCount = useMemo(() => {
    return players.filter((p) => {
      const tid = p._dbTeamId;
      return tid === teamId && p.assignedPosition === "IL" && (p._dbPlayerId ?? 0) > 0;
    }).length;
  }, [players, teamId]);

  return (
    <div className="space-y-6">
      {/* Mode selector — matches ActivityPage's top-level tab pattern for
          visual consistency. */}
      <div className="lg-card p-1 inline-flex gap-1">
        {MODES.map((m) => (
          <Button
            key={m}
            onClick={() => setMode(m)}
            variant={mode === m ? "default" : "ghost"}
            size="sm"
            className="px-4"
          >
            {MODE_LABEL[m]}
            {m === "activate-il" && ilCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/40 px-1.5 text-[10px] font-semibold text-amber-300">
                {ilCount}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Banner: if the team has IL-stashed players and the user is on a
          non-Activate mode, surface a one-click shortcut. Complements the
          count pill without forcing auto-switch. */}
      {ilCount > 0 && mode !== "activate-il" && (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200 flex items-center justify-between">
          <span>
            {ilCount === 1 ? "1 player is" : `${ilCount} players are`} currently on your IL.
          </span>
          <button
            type="button"
            onClick={() => setMode("activate-il")}
            className="text-xs font-semibold underline hover:text-amber-100"
          >
            Activate from IL →
          </button>
        </div>
      )}

      {/* Panels — conditional render (not display:none) so each mode's
          form state resets on switch. Queries are shared at this level
          via the `players` prop so switching modes doesn't re-fetch. */}
      <div className="lg-card p-4">
        {mode === "add-drop" && (
          <AddDropPanel
            leagueId={leagueId}
            teamId={teamId}
            players={players}
            onComplete={onComplete}
          />
        )}
        {mode === "place-il" && (
          <PlaceOnIlPanel
            leagueId={leagueId}
            teamId={teamId}
            players={players}
            onComplete={onComplete}
          />
        )}
        {mode === "activate-il" && (
          <ActivateFromIlPanel
            leagueId={leagueId}
            teamId={teamId}
            players={players}
            onComplete={onComplete}
          />
        )}
      </div>
    </div>
  );
}
