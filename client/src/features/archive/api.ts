
import { fetchJsonApi, API_BASE } from '../../api/base';
import { PlayerSeasonStat } from '../../api/types';

export async function getArchiveSeasons(): Promise<{ seasons: number[] }> {
    return fetchJsonApi(`${API_BASE}/archive/seasons`);
}

export async function getArchivePeriods(year: number): Promise<any> {
    return fetchJsonApi(`${API_BASE}/archive/${year}/periods`);
}

export async function getArchivePeriodStats(year: number, periodNum: number): Promise<any> {
    return fetchJsonApi(`${API_BASE}/archive/${year}/period/${periodNum}/stats`);
}

export async function getArchiveDraftResults(year: number): Promise<any> {
    return fetchJsonApi(`${API_BASE}/archive/${year}/draft-results`);
}

export async function updateArchiveTeamName(year: number, teamCode: string, newName: string): Promise<any> {
    return fetchJsonApi(`${API_BASE}/archive/${year}/teams/${teamCode}`, {
        method: 'PUT',
        body: JSON.stringify({ newName })
    });
}

// Player Search / Edit
export async function searchArchivePlayers(query: string): Promise<{ players: any[] }> {
    return fetchJsonApi(`${API_BASE}/archive/search-players?query=${encodeURIComponent(query)}`);
}

export async function searchMLBPlayers(query: string): Promise<{ players: any[] }> {
    return fetchJsonApi(`${API_BASE}/archive/search-mlb?query=${encodeURIComponent(query)}`);
}

export async function updateArchivePlayerStat(id: number, data: Partial<{ fullName: string; mlbId: string; mlbTeam: string; position: string; }>): Promise<any> {
    return fetchJsonApi(`${API_BASE}/archive/stat/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    });
}

// Trophy Case
export interface ChampionshipEntry {
  year: number;
  teamName: string;
  teamCode: string;
}

export interface AllTimeStandingEntry {
  teamCode: string;
  teamName: string;
  totalPoints: number;
  seasons: number;
  avgRank: number;
  avgScore: number;
}

export interface DynastyScoreEntry {
  teamCode: string;
  teamName: string;
  score: number;
  championships: number;
  seasons: number;
  avgRank: number;
}

export interface TrophyCaseRecords {
  bestSeason: { year: number; teamCode: string; teamName: string; totalScore: number } | null;
  worstSeason: { year: number; teamCode: string; teamName: string; totalScore: number } | null;
  mostChampionships: { teamCode: string; teamName: string; count: number } | null;
  bestCategoryBySeason: Record<string, { year: number; teamCode: string; teamName: string; value: number }>;
}

export interface TrophyCaseData {
  championships: ChampionshipEntry[];
  allTimeStandings: AllTimeStandingEntry[];
  records: TrophyCaseRecords;
  dynastyScores: DynastyScoreEntry[];
}

export async function getTrophyCase(leagueId: number): Promise<TrophyCaseData> {
    return fetchJsonApi(`${API_BASE}/archive/trophy-case?leagueId=${leagueId}`);
}
