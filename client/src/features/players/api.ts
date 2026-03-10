
import { fetchJsonApi, fetchJsonPublic, toNum, fmt2, fmt3Avg, API_BASE, MLB_API_BASE } from '../../api/base';
import {
  PlayerSeasonStat,
  PlayerProfile,
  CareerHittingRow,
  CareerPitchingRow,
  CareerStatsResponse,
  RecentHittingRow,
  RecentPitchingRow,
  RecentStatsResponse,
  HOrP,
  SeasonStandingsApiResponse,
  SeasonStandingRow,
  PeriodStatRow,
  PeriodCategoryStandingsResponse
} from '../../api/types';

/**Stable React key helper */
export function playerKey(p: any): string {
  if (!p) return "—";
  if (typeof p.row_id === "string" && p.row_id.trim()) return p.row_id.trim();
  const mlb = String(p.mlb_id ?? "").trim();
  const isP = Boolean(p.is_pitcher ?? p.isPitcher);
  const role = isP ? "P" : "H";
  return `${mlb}-${role}`;
}

const _seasonStatsCache = new Map<number, Promise<PlayerSeasonStat[]>>();
const _periodStatsCache = new Map<number, Promise<PeriodStatRow[]>>();
let _auctionCache: Promise<PlayerSeasonStat[]> | null = null;
const _seasonStandingsCache = new Map<number, Promise<SeasonStandingsApiResponse>>();
const _periodCategoryCache = new Map<string, Promise<PeriodCategoryStandingsResponse>>();
const _mlbCache = new Map<string, Promise<any>>();

function roleFromRow(row: Record<string, unknown>): "H" | "P" {
  const g = String(row?.group ?? "").trim().toUpperCase();
  if (g === "P") return "P";
  if (g === "H") return "H";
  return (row?.is_pitcher ?? row?.isPitcher) ? "P" : "H";
}

function normalizeTwoWayRow(row: any): PlayerSeasonStat {
  const mlb_id = String(row?.mlb_id ?? row?.mlbId ?? "").trim();
  const role = roleFromRow(row);
  const is_pitcher = role === "P";
  const positions = is_pitcher ? "P" : String(row?.positions ?? row?.pos ?? "").trim();
  const player_name = String(row?.player_name ?? row?.name ?? "").trim();

  return {
    mlb_id,
    row_id: `${mlb_id}-${role}`,
    player_name,
    mlb_full_name: String(row?.mlb_full_name ?? "").trim(),
    ogba_team_code: String(row?.ogba_team_code ?? row?.team ?? "").trim(),
    group: role,
    is_pitcher,
    positions,
    mlb_team: String(row?.mlb_team ?? row?.mlbTeam ?? "").trim(),
    mlbTeam: String(row?.mlbTeam ?? row?.mlb_team ?? "").trim(),
    AB: row?.AB,
    H: row?.H,
    R: row?.R,
    HR: row?.HR,
    RBI: row?.RBI,
    SB: row?.SB,
    AVG: row?.AVG,
    W: row?.W,
    SV: row?.SV,
    K: row?.K,
    IP: row?.IP,
    ER: row?.ER,
    ERA: row?.ERA,
    BB_H: row?.BB_H,
    WHIP: row?.WHIP,
    dollar_value: row?.dollar_value ?? row?.value,
    value: row?.value,
    z_total: row?.z_total ?? row?.relValue,
    GS: row?.GS,
    SO: row?.SO,
    pos: row?.pos,
    name: row?.name,
    team: row?.team,
    isPitcher: row?.isPitcher,
  };
}

function dedupeByRowId(rows: PlayerSeasonStat[], mode: "season" | "auction" = "season"): PlayerSeasonStat[] {
  const m = new Map<string, PlayerSeasonStat>();
  function score(r: PlayerSeasonStat): number {
    const raw = r as unknown as Record<string, unknown>;
    if (mode === "auction") return Number(raw.dollar_value ?? raw.value) || 0;
    return (toNum(raw.AB) + toNum(raw.H) + toNum(raw.IP) + toNum(raw.K) + toNum(raw.R) + toNum(raw.HR) + toNum(raw.RBI));
  }
  for (const r of rows) {
    const k = String(r.row_id ?? "").trim() || `${r.mlb_id}-${r.group ?? (r.is_pitcher ? "P" : "H")}`;
    const prev = m.get(k);
    if (!prev || score(r) >= score(prev)) m.set(k, r);
  }
  return Array.from(m.values());
}

export async function getAuctionValues(): Promise<PlayerSeasonStat[]> {
  if (!_auctionCache) {
    _auctionCache = (async () => {
      const resp = await fetchJsonApi<{ values: unknown[] }>(`${API_BASE}/auction-values`);
      const raw = resp?.values ?? [];
      return dedupeByRowId(raw.map(normalizeTwoWayRow), "auction");
    })();
  }
  return _auctionCache;
}

export async function getPlayerSeasonStats(leagueId?: number): Promise<PlayerSeasonStat[]> {
  const key = leagueId ?? 1;
  if (!_seasonStatsCache.has(key)) {
    _seasonStatsCache.set(key, (async () => {
      const url = leagueId && leagueId !== 1
        ? `${API_BASE}/player-season-stats?leagueId=${leagueId}`
        : `${API_BASE}/player-season-stats`;
      const resp = await fetchJsonApi<{ stats: unknown[] }>(url);
      const raw = resp?.stats ?? [];
      return dedupeByRowId(raw.map(normalizeTwoWayRow), "season");
    })());
  }
  return _seasonStatsCache.get(key)!;
}

export async function getPlayerPeriodStats(leagueId?: number): Promise<PeriodStatRow[]> {
  const key = leagueId ?? 1;
  if (!_periodStatsCache.has(key)) {
    _periodStatsCache.set(key, (async () => {
      const url = leagueId && leagueId !== 1
        ? `${API_BASE}/player-period-stats?leagueId=${leagueId}`
        : `${API_BASE}/player-period-stats`;
      const resp = await fetchJsonApi<{ stats: PeriodStatRow[] }>(url);
      return resp?.stats ?? [];
    })());
  }
  return _periodStatsCache.get(key)!;
}

export async function getSeasonStandings(leagueId?: number): Promise<SeasonStandingsApiResponse> {
  const cacheKey = leagueId ?? 1;
  if (!_seasonStandingsCache.has(cacheKey)) {
    _seasonStandingsCache.set(cacheKey, (async () => {
      const lid = leagueId || 1;
      const url = `${API_BASE}/season?leagueId=${lid}`;
      const raw = await fetchJsonApi<any>(url);

      // Backend returns { data: [...] }
      if (raw && Array.isArray(raw.data)) {
           return { periodIds: [], rows: raw.data as SeasonStandingRow[] };
      }

      if (raw && Array.isArray(raw.rows)) {
        const periodIds = Array.isArray(raw.periodIds) ? raw.periodIds.map((x: any) => Number(x)).filter(Number.isFinite) : [];
        return { periodIds, rows: raw.rows as SeasonStandingRow[] };
      }
      if (Array.isArray(raw)) return { periodIds: [], rows: raw as SeasonStandingRow[] };
      return { periodIds: [], rows: [] };
    })());
  }
  return _seasonStandingsCache.get(cacheKey)!;
}

export async function getPeriodCategoryStandings(periodId: string | number, leagueId?: number): Promise<PeriodCategoryStandingsResponse> {
  const pidKey = String(periodId ?? "").trim();
  if (!pidKey) throw new Error("Missing periodId");
  const lid = leagueId || 1;
  const key = `${pidKey}-L${lid}`;
  const hit = _periodCategoryCache.get(key);
  if (hit) return hit;
  const p = fetchJsonApi<PeriodCategoryStandingsResponse>(`${API_BASE}/period-category-standings?periodId=${encodeURIComponent(pidKey)}&leagueId=${lid}`);
  _periodCategoryCache.set(key, p);
  return p;
}

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = _mlbCache.get(key);
  if (hit) return hit as Promise<T>;
  const p = fn();
  _mlbCache.set(key, p as any);
  return p;
}

export async function getPlayerProfile(mlbId: string): Promise<PlayerProfile> {
  const id = String(mlbId ?? "").trim();
  if (!id) throw new Error("Missing mlbId");
  return cached(`profile:${id}`, async () => {
    const data = await fetchJsonPublic<any>(`${MLB_API_BASE}/people/${id}`);
    const p = data?.people?.[0];
    if (!p) throw new Error(`No profile for mlbId=${id}`);
    return {
      mlbId: id,
      fullName: p.fullName ?? p.nameFirstLast ?? String(p.id ?? id),
      currentTeam: p?.currentTeam?.name,
      primaryPosition: p?.primaryPosition?.abbreviation ?? p?.primaryPosition?.name,
      bats: p?.batSide?.code,
      throws: p?.pitchHand?.code,
      height: p?.height,
      weight: p?.weight ? String(p.weight) : undefined,
      birthDate: p?.birthDate,
      mlbDebutDate: p?.mlbDebutDate,
    };
  });
}

export async function getPlayerCareerStats(mlbId: string, group: HOrP): Promise<CareerStatsResponse> {
    const id = String(mlbId ?? "").trim();
    if (!id) throw new Error("Missing mlbId");
    return cached(`career:${group}:${id}`, async () => {
        const url = `${MLB_API_BASE}/people/${id}/stats?stats=yearByYear&group=${group}`;
        const data = await fetchJsonPublic<any>(url);
        const splits = (data?.stats?.[0]?.splits ?? []) as any[];
        
        const rows: any[] = splits.filter((s:any) => s.sport?.id === 1 && s.league?.id).map((s:any) => {
            const st = s.stat;
            if (group === "hitting") {
                const AB = toNum(st.atBats);
                const H = toNum(st.hits);
                return {
                    year: s.season,
                    tm: s.team?.abbreviation || s.team?.name || "??",
                    G: toNum(st.gamesPlayed),
                    AB,
                    R: toNum(st.runs),
                    H,
                    d2B: toNum(st.doubles),
                    d3B: toNum(st.triples),
                    HR: toNum(st.homeRuns),
                    RBI: toNum(st.rbi),
                    SB: toNum(st.stolenBases),
                    CS: toNum(st.caughtStealing),
                    BB: toNum(st.baseOnBalls),
                    SO: toNum(st.strikeOuts),
                    GS: toNum(st.grandSlams),
                    AVG: fmt3Avg(H, AB),
                    OBP: st.obp || ".000",
                    SLG: st.slg || ".000",
                } satisfies CareerHittingRow;
            } else {
                return {
                   year: s.season,
                   tm: s.team?.abbreviation || s.team?.name || "??",
                   G: toNum(st.gamesPlayed),
                   GS: toNum(st.gamesStarted),
                   W: toNum(st.wins),
                   L: toNum(st.losses),
                   SV: toNum(st.saves),
                   IP: toNum(st.inningsPitched),
                   H: toNum(st.hits),
                   ER: toNum(st.earnedRuns),
                   HR: toNum(st.homeRuns),
                   BB: toNum(st.baseOnBalls),
                   SO: toNum(st.strikeOuts),
                   SHO: toNum(st.shutouts),
                   ERA: st.era || "0.00",
                   WHIP: st.whip || "0.00",
                } satisfies CareerPitchingRow;
            }
        });

        // Add Career Total
        const careerUrl = `${MLB_API_BASE}/people/${id}/stats?stats=career&group=${group}`;
        const careerData = await fetchJsonPublic<any>(careerUrl);
        const cStat = careerData?.stats?.[0]?.splits?.[0]?.stat;
        if (cStat) {
            if (group === "hitting") {
                const AB = toNum(cStat.atBats);
                const H = toNum(cStat.hits);
                rows.push({
                    year: "TOT",
                    tm: "-",
                    G: toNum(cStat.gamesPlayed),
                    AB,
                    R: toNum(cStat.runs),
                    H,
                    d2B: toNum(cStat.doubles),
                    d3B: toNum(cStat.triples),
                    HR: toNum(cStat.homeRuns),
                    RBI: toNum(cStat.rbi),
                    SB: toNum(cStat.stolenBases),
                    CS: toNum(cStat.caughtStealing),
                    BB: toNum(cStat.baseOnBalls),
                    SO: toNum(cStat.strikeOuts),
                    GS: toNum(cStat.grandSlams),
                    AVG: fmt3Avg(H, AB),
                    OBP: cStat.obp || ".000",
                    SLG: cStat.slg || ".000",
                } satisfies CareerHittingRow);
            } else {
                rows.push({
                    year: "TOT",
                    tm: "-",
                    G: toNum(cStat.gamesPlayed),
                    GS: toNum(cStat.gamesStarted),
                    W: toNum(cStat.wins),
                    L: toNum(cStat.losses),
                    SV: toNum(cStat.saves),
                    IP: toNum(cStat.inningsPitched),
                    H: toNum(cStat.hits),
                    ER: toNum(cStat.earnedRuns),
                    HR: toNum(cStat.homeRuns),
                    BB: toNum(cStat.baseOnBalls),
                    SO: toNum(cStat.strikeOuts),
                    SHO: toNum(cStat.shutouts),
                    ERA: cStat.era || "0.00",
                    WHIP: cStat.whip || "0.00",
                } satisfies CareerPitchingRow);
            }
        }

        return { rows };
    });
}

export async function getPlayerRecentStats(mlbId: string, group: HOrP): Promise<RecentStatsResponse> {
  const id = String(mlbId ?? "").trim();
  if (!id) throw new Error("Missing mlbId");

  return cached(`recent:${group}:${id}`, async () => {
    // Fetch Season (YTD) + standard recent splits
    // Note: 'last15Days' and 'last30Days' are standard. UI asks for 14/21 but we'll provide closest standard or all.
    const url = `${MLB_API_BASE}/people/${id}/stats?stats=season,last7Days,last15Days,last30Days&group=${group}`;
    const data = await fetchJsonPublic<any>(url);
    
    const rows: (RecentHittingRow | RecentPitchingRow)[] = [];
    const allSplits = data?.stats?.flatMap((g: any) => g.splits ?? []) ?? [];

    for (const split of allSplits) {
      const type = split.type?.displayName; // "season", "last 7 days", ...
      let label = "";

      if (type === "season") label = "YTD";
      else if (type === "last 7 days") label = "7d";
      else if (type === "last 15 days") label = "15d";
      else if (type === "last 30 days") label = "30d";
      else continue;

      const st = split.stat;
      if (!st) continue;

      if (group === "hitting") {
         const AB = toNum(st.atBats);
         const H = toNum(st.hits);
         rows.push({
           label,
           AB, 
           H,
           R: toNum(st.runs),
           HR: toNum(st.homeRuns),
           RBI: toNum(st.rbi),
           SB: toNum(st.stolenBases),
           AVG: fmt3Avg(H, AB),
         } satisfies RecentHittingRow);
      } else {
         // pitching
         rows.push({
           label,
           IP: st.inningsPitched ?? "0.0",
           W: toNum(st.wins),
           SV: toNum(st.saves),
           K: toNum(st.strikeOuts),
           ERA: st.era ?? "0.00",
           WHIP: st.whip ?? "0.00",
         } satisfies RecentPitchingRow);
      }
    }
    
    // Sort rows: 7d, 15d, 30d, YTD
    const order = ["7d", "15d", "30d", "YTD"];
    rows.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));

    return { rows };
  });
}

export interface FieldingStatRow {
  position: string;
  games: number;
  gamesStarted: number;
  innings: number;
}

export async function getPlayerFieldingStats(mlbId: string, season: number = 2024): Promise<FieldingStatRow[]> {
  const id = String(mlbId ?? "").trim();
  if (!id) return [];

  return cached(`fielding:${id}:${season}`, async () => {
    const url = `${MLB_API_BASE}/people/${id}/stats?stats=statsSingleSeason&group=fielding&season=${season}`;
    const data = await fetchJsonPublic<any>(url);
    const splits = data?.stats?.[0]?.splits ?? [];

    return splits.map((s: any) => ({
      position: s.position?.abbreviation ?? s.position?.name ?? "??",
      games: toNum(s.stat?.games),
      gamesStarted: toNum(s.stat?.gamesStarted),
      innings: toNum(s.stat?.innings),
    })).sort((a: FieldingStatRow, b: FieldingStatRow) => b.games - a.games);
  });
}
