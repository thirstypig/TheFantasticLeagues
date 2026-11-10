import { API_BASE, fetchJsonApi } from "../../api/base";
import type { MyPlayerToday, PlayerNewsTx } from "./todayModel";

export type { MyPlayerToday, PlayerNewsTx } from "./todayModel";

export function getMyPlayersToday(leagueId: number): Promise<{ players: MyPlayerToday[] }> {
  return fetchJsonApi<{ players: MyPlayerToday[] }>(`${API_BASE}/mlb/my-players-today?leagueId=${leagueId}`);
}

export function getMyPlayerNews(leagueId: number): Promise<{ items: PlayerNewsTx[] }> {
  return fetchJsonApi<{ items: PlayerNewsTx[] }>(`${API_BASE}/mlb/my-player-news?leagueId=${leagueId}`);
}
