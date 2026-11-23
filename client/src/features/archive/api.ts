
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
  /** The team's name that year. */
  teamName: string;
  teamCode: string;
  owner: string | null;
}

export interface AllTimeStandingEntry {
  /** The owner, or the franchise code when no owner is on record. */
  key: string;
  owner: string | null;
  teamCode: string;
  teamName: string;
  /** Every name the owner's teams used, most recent first. */
  teamNames: string[];
  totalPoints: number;
  seasons: number;
  avgRank: number;
  avgScore: number;
  championships: number;
}

export interface DynastyScoreEntry {
  key: string;
  owner: string | null;
  teamCode: string;
  teamName: string;
  teamNames: string[];
  score: number;
  championships: number;
  seasons: number;
  avgRank: number;
}

export interface TrophyCaseRecords {
  bestSeason: { year: number; teamCode: string; teamName: string; owner: string | null; totalScore: number } | null;
  worstSeason: { year: number; teamCode: string; teamName: string; owner: string | null; totalScore: number } | null;
  /** Every owner tied for the most titles. */
  mostChampionships: { teamCode: string; teamName: string; owners: string[]; count: number } | null;
  bestCategoryBySeason: Record<string, { year: number; teamCode: string; teamName: string; value: number }>;
}

export interface FavoriteKeeper {
  name: string;
  mlbId: number | null;
  seasons: number[];
  /** Some seasons only "possible" keepers (same team and price; no keeper list that year). */
  possible: boolean;
}

export interface OwnerProfile {
  key: string;
  owner: string | null;
  /** Who owned the team, as runs of seasons, most recent first. */
  owners: { name: string; from: number; to: number }[];
  teams: { name: string; from: number; to: number }[];
  titleYears: number[];
  /** Every season played, most recent first. */
  seasons: { year: number; teamName: string; owner: string | null; rank: number; teams: number; total: number }[];
  favoriteKeepers: FavoriteKeeper[];
}

export interface TrophyCaseData {
  championships: ChampionshipEntry[];
  allTimeStandings: AllTimeStandingEntry[];
  records: TrophyCaseRecords;
  dynastyScores: DynastyScoreEntry[];
  profiles: Record<string, OwnerProfile>;
  keeperSeasons: number[];
}

export async function getTrophyCase(leagueId: number): Promise<TrophyCaseData> {
    return fetchJsonApi(`${API_BASE}/archive/trophy-case?leagueId=${leagueId}`);
}
