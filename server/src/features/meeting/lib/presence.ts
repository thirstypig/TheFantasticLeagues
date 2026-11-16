/**
 * In-memory presence for the live meeting: Map<leagueId, Map<teamId, lastSeenMs>>.
 *
 * No timers. "Online" is computed on read (seen within ONLINE_WINDOW_MS); stale
 * entries are pruned during that read. Losing this on restart is harmless —
 * it refills on the next poll.
 */
const ONLINE_WINDOW_MS = 10_000;

const seen = new Map<number, Map<number, number>>();

export function markSeen(leagueId: number, teamIds: number[], nowMs: number): void {
  if (teamIds.length === 0) return;
  let league = seen.get(leagueId);
  if (!league) {
    league = new Map();
    seen.set(leagueId, league);
  }
  for (const t of teamIds) league.set(t, nowMs);
}

export function onlineTeamIds(leagueId: number, nowMs: number): number[] {
  const league = seen.get(leagueId);
  if (!league) return [];
  const out: number[] = [];
  for (const [teamId, at] of league) {
    if (nowMs - at <= ONLINE_WINDOW_MS) out.push(teamId);
    else league.delete(teamId);
  }
  if (league.size === 0) seen.delete(leagueId);
  return out;
}

/** Test-only. */
export function _resetPresence(): void {
  seen.clear();
}
