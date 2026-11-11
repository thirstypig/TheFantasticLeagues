import { fetchJsonApi, API_BASE } from "../../../api/base";

// Client mirror of GET /api/players/:mlbId/card (do not import from server/).
export type StatGroup = "hitting" | "pitching";
export type StatLine = Record<string, number | string>;
export type RangeKey = "last7" | "last14" | "last30" | "season" | "lastSeason";
export type GroupStats = Partial<Record<StatGroup, StatLine | null>>;
export type GameRow = { date: string; opp: string; home: boolean; line: StatLine };
export type PlayerCardData = {
  mlbId: number;
  playerId: number | null;
  name: string;
  pos: string;
  mlbTeam: string | null;
  isPitcher: boolean;
  isTwoWay: boolean;
  fantasyTeam: { id: number; name: string; code: string | null } | null;
  nextGame: { opp: string; home: boolean; startUtc: string } | null;
  splits: Record<RangeKey, GroupStats>;
  recent: Partial<Record<StatGroup, GameRow[]>>;
  /** Every windowed stat call failed server-side: show retry copy, not 'No games yet'. Absent on older payloads. */
  degraded?: boolean;
};

export function getPlayerCard(mlbId: number, leagueId: number): Promise<PlayerCardData> {
  return fetchJsonApi(`${API_BASE}/players/${mlbId}/card?leagueId=${leagueId}`);
}

// Local watchlist wrapper (ADR-015: no import from features/watchlist).
export async function getWatchlistMlbIds(teamId: number): Promise<Set<number>> {
  const res = await fetchJsonApi<{ items: { player: { mlbId: number | null } }[] }>(
    `${API_BASE}/watchlist?teamId=${teamId}`,
  );
  return new Set(res.items.map((i) => i.player.mlbId).filter((x): x is number => x != null));
}

export async function addWatchlist(teamId: number, playerId: number): Promise<void> {
  await fetchJsonApi(`${API_BASE}/watchlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, playerId }),
  });
}

export async function removeWatchlist(teamId: number, playerId: number): Promise<void> {
  await fetchJsonApi(`${API_BASE}/watchlist/${playerId}?teamId=${teamId}`, { method: "DELETE" });
}
