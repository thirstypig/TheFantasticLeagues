import { prisma } from '../../../db/prisma.js';
import { logger } from '../../../lib/logger.js';

/**
 * All-time trophy case, built from the rebuilt archive (HistoricalTeam): one
 * row per franchise per season with the commissioner's recorded total, keyed
 * by the franchise code that stays the same across years and team names.
 *
 * It used to read HistoricalStanding, which held only 2022 and 2024 with
 * different made-up codes each year (Diamond Kings was DKG in 2022 and DKD in
 * 2024), so one franchise showed up as two teams.
 *
 * Finishing places come from the recorded totals; tied teams share a place.
 * Category records need per-category scores, which the archive doesn't have
 * until the re-score, so bestCategoryBySeason is empty for now.
 */

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
  /** Average finishing place, two decimals. The leaderboard is ordered by this. */
  avgRank: number;
  avgScore: number;
  championships: number;
}

export interface Records {
  bestSeason: { year: number; teamCode: string; teamName: string; totalScore: number } | null;
  worstSeason: { year: number; teamCode: string; teamName: string; totalScore: number } | null;
  mostChampionships: { teamCode: string; teamName: string; count: number } | null;
  bestCategoryBySeason: Record<string, { year: number; teamCode: string; teamName: string; value: number }>;
}

export interface DynastyScoreEntry {
  teamCode: string;
  teamName: string;
  score: number;
  championships: number;
  seasons: number;
  avgRank: number;
}

export interface TrophyCase {
  championships: ChampionshipEntry[];
  allTimeStandings: AllTimeStandingEntry[];
  records: Records;
  dynastyScores: DynastyScoreEntry[];
}

/** One franchise's season: the name it used that year and its recorded total. */
export interface SeasonResult { year: number; code: string; name: string; total: number }

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Competition ranking: 1, 2, 2, 4 — tied totals share a place. */
export function rankSeason(results: SeasonResult[]): (SeasonResult & { rank: number })[] {
  const sorted = [...results].sort((a, b) => b.total - a.total);
  return sorted.map((r) => ({ ...r, rank: 1 + sorted.filter((o) => o.total > r.total).length }));
}

export function buildTrophyCase(results: SeasonResult[]): TrophyCase {
  const empty: TrophyCase = {
    championships: [], allTimeStandings: [], dynastyScores: [],
    records: { bestSeason: null, worstSeason: null, mostChampionships: null, bestCategoryBySeason: {} },
  };
  if (results.length === 0) return empty;

  const years = [...new Set(results.map((r) => r.year))].sort((a, b) => a - b);
  const ranked = years.flatMap((y) => rankSeason(results.filter((r) => r.year === y)));
  const teamsIn = new Map(years.map((y) => [y, results.filter((r) => r.year === y).length]));

  // A franchise is shown by the name it used most recently.
  const currentName = new Map<string, string>();
  for (const r of ranked) currentName.set(r.code, r.name); // ranked is oldest season first

  const championships: ChampionshipEntry[] = ranked
    .filter((r) => r.rank === 1)
    .map((r) => ({ year: r.year, teamName: r.name, teamCode: r.code }));

  const agg = new Map<string, { totalPoints: number; seasons: number; totalRank: number; championships: number; dynastyScore: number }>();
  for (const r of ranked) {
    const a = agg.get(r.code) ?? { totalPoints: 0, seasons: 0, totalRank: 0, championships: 0, dynastyScore: 0 };
    const n = teamsIn.get(r.year) ?? 8;
    a.totalPoints += r.total;
    a.seasons += 1;
    a.totalRank += r.rank;
    if (r.rank === 1) { a.championships += 1; a.dynastyScore += 100; }
    else if (r.rank === 2) a.dynastyScore += 60;
    else if (r.rank === 3) a.dynastyScore += 40;
    a.dynastyScore += (n - r.rank + 1) * 5 + 5; // finish bonus + a season played
    agg.set(r.code, a);
  }

  // Ordered by average finish (James, 2026-11-22: rankings matter, all-time
  // points don't — teams played different numbers of seasons). Exact averages
  // decide; a tie goes to more titles, then more seasons.
  const allTimeStandings: AllTimeStandingEntry[] = [...agg.entries()]
    .map(([code, a]) => ({
      entry: {
        teamCode: code, teamName: currentName.get(code)!, totalPoints: round1(a.totalPoints), seasons: a.seasons,
        avgRank: round2(a.totalRank / a.seasons), avgScore: round1(a.totalPoints / a.seasons), championships: a.championships,
      },
      exact: a.totalRank / a.seasons,
    }))
    .sort((a, b) => a.exact - b.exact || b.entry.championships - a.entry.championships || b.entry.seasons - a.entry.seasons)
    .map((x) => x.entry);

  const dynastyScores: DynastyScoreEntry[] = [...agg.entries()]
    .map(([code, a]) => ({
      teamCode: code, teamName: currentName.get(code)!, score: a.dynastyScore, championships: a.championships,
      seasons: a.seasons, avgRank: round1(a.totalRank / a.seasons),
    }))
    .sort((a, b) => b.score - a.score);

  // Best and worst season. 2020 was a 60-game season with 4 scoring periods, and
  // 2003 had 6, so only full 7-period seasons compete — otherwise every 2020
  // total would be the "worst season ever".
  let bestSeason: Records['bestSeason'] = null;
  let worstSeason: Records['worstSeason'] = null;
  for (const r of ranked) {
    if (r.year === 2020 || r.year === 2003) continue;
    if (!bestSeason || r.total > bestSeason.totalScore) bestSeason = { year: r.year, teamCode: r.code, teamName: r.name, totalScore: r.total };
    if (!worstSeason || r.total < worstSeason.totalScore) worstSeason = { year: r.year, teamCode: r.code, teamName: r.name, totalScore: r.total };
  }

  // A tie names every franchise in it (Skunk Dogs and Diamond Kings: 6 each through 2025).
  let mostChampionships: Records['mostChampionships'] = null;
  const most = Math.max(0, ...[...agg.values()].map((a) => a.championships));
  if (most > 0) {
    const leaders = [...agg.entries()].filter(([, a]) => a.championships === most).map(([code]) => code)
      .sort((x, y) => currentName.get(x)!.localeCompare(currentName.get(y)!));
    mostChampionships = { teamCode: leaders.join(", "), teamName: leaders.map((c) => currentName.get(c)!).join(" & "), count: most };
  }

  return { championships, allTimeStandings, dynastyScores, records: { bestSeason, worstSeason, mostChampionships, bestCategoryBySeason: {} } };
}

/** The trophy case for the archive of the franchise this league belongs to. */
export async function computeTrophyCase(leagueId: number): Promise<TrophyCase> {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { franchiseId: true } });
  if (!league) return buildTrophyCase([]);
  const teams = await prisma.historicalTeam.findMany({
    where: { recordedTotal: { not: null }, season: { league: { franchiseId: league.franchiseId } } },
    select: { code: true, name: true, recordedTotal: true, season: { select: { year: true } } },
  });
  const results: SeasonResult[] = teams.map((t) => ({ year: t.season.year, code: t.code, name: t.name, total: t.recordedTotal! }));
  const trophyCase = buildTrophyCase(results);
  logger.info({ leagueId, seasons: new Set(results.map((r) => r.year)).size, franchises: trophyCase.allTimeStandings.length }, 'Trophy case computed');
  return trophyCase;
}
