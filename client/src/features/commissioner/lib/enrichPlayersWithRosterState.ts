/**
 * Annotate league-pool players with the fantasy-team join data needed by
 * RosterMovesTab / IL panels.
 *
 * The shared `PlayerSeasonStat` schema does NOT carry `_dbTeamId`,
 * `_dbPlayerId`, `_rosterId`, or `assignedPosition` — those are derived
 * client-side from the roster join. Without this enrichment, the
 * `AddDropPanel` / `PlaceOnIlPanel` / `ActivateFromIlPanel` filters
 * (`p._dbTeamId === teamId`) match nothing and dropdowns appear empty
 * regardless of which team is selected. That was the session-80 "Acting As
 * stale dropdown" bug; this helper is the fix.
 *
 * Pure function — no React, no hooks. Easy to unit test, easy to grow with
 * additional join concerns later (watchlist, owner display, etc.).
 *
 * Same bug class as PR #125's react-key collision and Session 75's
 * free-agent `_dbPlayerId` trap — see
 * `docs/solutions/logic-errors/react-key-collision-from-optional-id-fallback.md`.
 */

interface RosterRow {
  id: number;
  teamId: number;
  assignedPosition?: string | null;
  player: { id: number };
}

interface TeamRow {
  id: number;
  name: string;
  code?: string | null;
}

interface PlayerRow {
  id?: number;
  ogba_team_code?: string;
  ogba_team_name?: string;
  assignedPosition?: string;
  _dbTeamId?: number;
  _dbPlayerId?: number;
  _rosterId?: number;
  [key: string]: unknown;
}

export function enrichPlayersWithRosterState<P extends PlayerRow>(
  players: P[],
  rosters: RosterRow[],
  teams: TeamRow[],
): P[] {
  if (rosters.length === 0) return players;
  const rosterByPlayerId = new Map(rosters.map(r => [r.player.id, r]));
  return players.map(p => {
    const pid = p.id;
    if (!pid) return p;
    const r = rosterByPlayerId.get(pid);
    if (!r) return p;
    const team = teams.find(t => t.id === r.teamId);
    if (!team) return p;
    return {
      ...p,
      ogba_team_code: team.code ?? team.name.substring(0, 3).toUpperCase(),
      ogba_team_name: team.name,
      _dbTeamId: r.teamId,
      _dbPlayerId: pid,
      _rosterId: r.id,
      assignedPosition: r.assignedPosition ?? p.assignedPosition,
    };
  });
}
