import { prisma } from '../../../db/prisma.js';
import { logger } from '../../../lib/logger.js';
import { archivePlayerKey, splitWorkbookName } from '../../../lib/archive/mlbNameMatcher.js';

/**
 * All-time trophy case, built from the rebuilt archive (HistoricalTeam): one
 * row per franchise per season with the commissioner's recorded total, keyed
 * by the franchise code that stays the same across years and team names.
 *
 * It used to read HistoricalStanding, which held only 2022 and 2024 with
 * different made-up codes each year (Diamond Kings was DKG in 2022 and DKD in
 * 2024), so one franchise showed up as two teams.
 *
 * Everything is credited to the OWNER (James, 2026-11-22), with the team name
 * as a detail; a season with no owner on record falls back to its franchise
 * code. An owner who ran two franchises would be one entry.
 *
 * Finishing places come from the recorded totals; tied teams share a place.
 * Category records need per-category scores, which the archive doesn't have
 * until the re-score, so bestCategoryBySeason is empty for now.
 */

export interface ChampionshipEntry {
  year: number;
  /** The name the team used that year. */
  teamName: string;
  teamCode: string;
  owner: string | null;
}

export interface AllTimeStandingEntry {
  /** Stable key for the entry: the owner, or the franchise code when no owner is on record. */
  key: string;
  owner: string | null;
  /** The owner's most recent team. */
  teamCode: string;
  teamName: string;
  /** Every name the owner's teams have used, most recent first (Los Doyers, The Fluffers, VIP BALCOS). */
  teamNames: string[];
  totalPoints: number;
  seasons: number;
  /** Average finishing place, two decimals. The leaderboard is ordered by this. */
  avgRank: number;
  avgScore: number;
  championships: number;
}

export interface Records {
  bestSeason: { year: number; teamCode: string; teamName: string; owner: string | null; totalScore: number } | null;
  worstSeason: { year: number; teamCode: string; teamName: string; owner: string | null; totalScore: number } | null;
  /** Every owner tied for the most titles. teamName/teamCode join theirs, for older clients. */
  mostChampionships: { teamCode: string; teamName: string; owners: string[]; count: number } | null;
  bestCategoryBySeason: Record<string, { year: number; teamCode: string; teamName: string; value: number }>;
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

export interface FavoriteKeeper {
  /** The MLB name once the player check settled him, else the workbook spelling. */
  name: string;
  mlbId: number | null;
  /** Seasons he started on this owner's team as a keeper. */
  seasons: number[];
  /** Some of those seasons only "possible" keepers (same team and price, no keeper list). */
  possible: boolean;
}

export interface OwnerProfile {
  key: string;
  owner: string | null;
  /** Each team name with the seasons it was used, most recent first. */
  teams: { name: string; from: number; to: number }[];
  titleYears: number[];
  /** Kept in at least two seasons, most seasons first. */
  favoriteKeepers: FavoriteKeeper[];
}

export interface TrophyCase {
  championships: ChampionshipEntry[];
  allTimeStandings: AllTimeStandingEntry[];
  records: Records;
  dynastyScores: DynastyScoreEntry[];
  /** Keyed like allTimeStandings[].key. */
  profiles: Record<string, OwnerProfile>;
  /** Seasons the workbooks give keepers for (a Keepers sheet, or derivable from prices). */
  keeperSeasons: number[];
}

/** One keeper row: a draft-day player marked kept, with the owner of his team that season. */
export interface KeeperRow {
  year: number;
  code: string;
  owner: string | null;
  playerName: string;
  slot: string;
  fromSheet: boolean;
  mlbId: number | null;
  mlbName: string | null;
}

/** Players an owner kept in two or more seasons — the same MLB player, or the same spelling when unresolved. */
export function favoriteKeepers(rows: KeeperRow[], limit = 6): FavoriteKeeper[] {
  const byPlayer = new Map<string, { name: string; mlbId: number | null; seasons: Set<number>; possible: boolean; lastYear: number }>();
  for (const r of rows) {
    const { abbr, surname } = splitWorkbookName(r.playerName);
    const id = r.mlbId != null ? `id:${r.mlbId}` : `name:${abbr}|${surname}`;
    const p = byPlayer.get(id) ?? { name: r.mlbName ?? r.playerName, mlbId: r.mlbId, seasons: new Set<number>(), possible: false, lastYear: 0 };
    p.seasons.add(r.year);
    if (!r.fromSheet) p.possible = true;
    if (r.year >= p.lastYear) { p.lastYear = r.year; p.name = r.mlbName ?? r.playerName; }
    byPlayer.set(id, p);
  }
  return [...byPlayer.values()]
    .filter((p) => p.seasons.size >= 2)
    .sort((a, b) => b.seasons.size - a.seasons.size || b.lastYear - a.lastYear || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((p) => ({ name: p.name, mlbId: p.mlbId, seasons: [...p.seasons].sort((x, y) => x - y), possible: p.possible }));
}

/** Team names as runs of consecutive use, most recent first: Los Doyers 2016–2025, The Fluffers 2008–2009… */
export function teamRuns(results: SeasonResult[]): OwnerProfile['teams'] {
  const sorted = [...results].sort((a, b) => a.year - b.year);
  const runs: OwnerProfile['teams'] = [];
  for (const r of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.name === r.name) last.to = r.year;
    else runs.push({ name: r.name, from: r.year, to: r.year });
  }
  return runs.reverse();
}

/** One franchise's season: the name it used that year and its recorded total. */
export interface SeasonResult { year: number; code: string; name: string; owner: string | null; total: number }

const keyOf = (r: SeasonResult) => r.owner?.trim() || r.code;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Competition ranking: 1, 2, 2, 4 — tied totals share a place. */
export function rankSeason(results: SeasonResult[]): (SeasonResult & { rank: number })[] {
  const sorted = [...results].sort((a, b) => b.total - a.total);
  return sorted.map((r) => ({ ...r, rank: 1 + sorted.filter((o) => o.total > r.total).length }));
}

export function buildTrophyCase(results: SeasonResult[], keepers: KeeperRow[] = []): TrophyCase {
  const empty: TrophyCase = {
    championships: [], allTimeStandings: [], dynastyScores: [],
    records: { bestSeason: null, worstSeason: null, mostChampionships: null, bestCategoryBySeason: {} },
    profiles: {}, keeperSeasons: [],
  };
  if (results.length === 0) return empty;

  const years = [...new Set(results.map((r) => r.year))].sort((a, b) => a - b);
  const ranked = years.flatMap((y) => rankSeason(results.filter((r) => r.year === y)));
  const teamsIn = new Map(years.map((y) => [y, results.filter((r) => r.year === y).length]));

  // An owner is shown with the team he ran most recently.
  const latest = new Map<string, SeasonResult>();
  for (const r of ranked) latest.set(keyOf(r), r); // ranked is oldest season first
  const ownerOf = (key: string) => latest.get(key)!.owner?.trim() || null;
  // Every name an owner's teams went by, most recent first.
  const namesOf = (key: string) => [...new Set(ranked.filter((r) => keyOf(r) === key).map((r) => r.name).reverse())];
  const label = (key: string) => ownerOf(key) ?? latest.get(key)!.name;

  const championships: ChampionshipEntry[] = ranked
    .filter((r) => r.rank === 1)
    .map((r) => ({ year: r.year, teamName: r.name, teamCode: r.code, owner: r.owner?.trim() || null }));

  const agg = new Map<string, { totalPoints: number; seasons: number; totalRank: number; championships: number; dynastyScore: number }>();
  for (const r of ranked) {
    const a = agg.get(keyOf(r)) ?? { totalPoints: 0, seasons: 0, totalRank: 0, championships: 0, dynastyScore: 0 };
    const n = teamsIn.get(r.year) ?? 8;
    a.totalPoints += r.total;
    a.seasons += 1;
    a.totalRank += r.rank;
    if (r.rank === 1) { a.championships += 1; a.dynastyScore += 100; }
    else if (r.rank === 2) a.dynastyScore += 60;
    else if (r.rank === 3) a.dynastyScore += 40;
    a.dynastyScore += (n - r.rank + 1) * 5 + 5; // finish bonus + a season played
    agg.set(keyOf(r), a);
  }

  // Ordered by average finish (James, 2026-11-22: rankings matter, all-time
  // points don't — teams played different numbers of seasons). Exact averages
  // decide; a tie goes to more titles, then more seasons.
  const allTimeStandings: AllTimeStandingEntry[] = [...agg.entries()]
    .map(([key, a]) => ({
      entry: {
        key, owner: ownerOf(key), teamCode: latest.get(key)!.code, teamName: latest.get(key)!.name, teamNames: namesOf(key), totalPoints: round1(a.totalPoints), seasons: a.seasons,
        avgRank: round2(a.totalRank / a.seasons), avgScore: round1(a.totalPoints / a.seasons), championships: a.championships,
      },
      exact: a.totalRank / a.seasons,
    }))
    .sort((a, b) => a.exact - b.exact || b.entry.championships - a.entry.championships || b.entry.seasons - a.entry.seasons)
    .map((x) => x.entry);

  const dynastyScores: DynastyScoreEntry[] = [...agg.entries()]
    .map(([key, a]) => ({
      key, owner: ownerOf(key), teamCode: latest.get(key)!.code, teamName: latest.get(key)!.name, teamNames: namesOf(key), score: a.dynastyScore, championships: a.championships,
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
    const at = { year: r.year, teamCode: r.code, teamName: r.name, owner: r.owner?.trim() || null, totalScore: r.total };
    if (!bestSeason || r.total > bestSeason.totalScore) bestSeason = at;
    if (!worstSeason || r.total < worstSeason.totalScore) worstSeason = at;
  }

  // A tie names every franchise in it (Skunk Dogs and Diamond Kings: 6 each through 2025).
  let mostChampionships: Records['mostChampionships'] = null;
  const most = Math.max(0, ...[...agg.values()].map((a) => a.championships));
  if (most > 0) {
    const leaders = [...agg.entries()].filter(([, a]) => a.championships === most).map(([key]) => key)
      .sort((x, y) => label(x).localeCompare(label(y)));
    mostChampionships = {
      teamCode: leaders.map((k) => latest.get(k)!.code).join(", "),
      teamName: leaders.map((k) => latest.get(k)!.name).join(" & "),
      owners: leaders.map(label),
      count: most,
    };
  }

  const keeperKey = (k: KeeperRow) => k.owner?.trim() || k.code;
  const profiles: Record<string, OwnerProfile> = {};
  for (const key of agg.keys()) {
    profiles[key] = {
      key,
      owner: ownerOf(key),
      teams: teamRuns(ranked.filter((r) => keyOf(r) === key)),
      titleYears: championships.filter((c) => (c.owner?.trim() || c.teamCode) === key).map((c) => c.year),
      favoriteKeepers: favoriteKeepers(keepers.filter((k) => keeperKey(k) === key)),
    };
  }
  const keeperSeasons = [...new Set(keepers.map((k) => k.year))].sort((a, b) => a - b);

  return {
    championships, allTimeStandings, dynastyScores, profiles, keeperSeasons,
    records: { bestSeason, worstSeason, mostChampionships, bestCategoryBySeason: {} },
  };
}

/** The trophy case for the archive of the franchise this league belongs to. */
export async function computeTrophyCase(leagueId: number): Promise<TrophyCase> {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { franchiseId: true } });
  if (!league) return buildTrophyCase([]);
  const teams = await prisma.historicalTeam.findMany({
    where: { recordedTotal: { not: null }, season: { league: { franchiseId: league.franchiseId } } },
    select: { code: true, name: true, ownerName: true, recordedTotal: true, season: { select: { year: true } } },
  });
  const results: SeasonResult[] = teams.map((t) => ({ year: t.season.year, code: t.code, name: t.name, owner: t.ownerName, total: t.recordedTotal! }));

  // Draft-day keepers, with each team's owner that season and the player-check identity.
  const scope = { league: { franchiseId: league.franchiseId } };
  const [keeperEntries, seasonTeams, matches] = await Promise.all([
    prisma.historicalRosterEntry.findMany({
      where: { kind: 'DRAFT', isKeeper: true, season: scope },
      select: { teamCode: true, playerName: true, slot: true, season: { select: { id: true, year: true, keepersFromSheet: true } } },
    }),
    prisma.historicalTeam.findMany({ where: { season: scope }, select: { seasonId: true, code: true, ownerName: true } }),
    prisma.historicalPlayerMatch.findMany({ where: { season: scope, mlbId: { not: null } }, select: { seasonId: true, key: true, mlbId: true, mlbName: true } }),
  ]);
  const ownerAt = new Map(seasonTeams.map((t) => [`${t.seasonId}|${t.code}`, t.ownerName]));
  const matchAt = new Map(matches.map((m) => [`${m.seasonId}|${m.key}`, m]));
  const keepers: KeeperRow[] = keeperEntries.map((e) => {
    const m = matchAt.get(`${e.season.id}|${e.season.year}|${archivePlayerKey(e.teamCode, e.playerName, e.slot)}`);
    return {
      year: e.season.year, code: e.teamCode, owner: ownerAt.get(`${e.season.id}|${e.teamCode}`) ?? null,
      playerName: e.playerName, slot: e.slot, fromSheet: e.season.keepersFromSheet,
      mlbId: m?.mlbId ?? null, mlbName: m?.mlbName ?? null,
    };
  });
  const trophyCase = buildTrophyCase(results, keepers);
  logger.info({ leagueId, seasons: new Set(results.map((r) => r.year)).size, franchises: trophyCase.allTimeStandings.length }, 'Trophy case computed');
  return trophyCase;
}
