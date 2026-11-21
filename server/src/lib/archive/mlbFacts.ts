/**
 * What MLB says about a player in one season — games by position, the season
 * line, career totals — parsed from statsapi `people?hydrate=stats(...)`
 * responses. Pure parsers and URL builders; the caller fetches (the audit
 * script caches to disk, the player-check search calls live).
 *
 * statsapi trap, hit three times now: a player traded mid-season gets one
 * split per team AND a combined split (no `team`, `numTeams` set). Adding them
 * all up double-counts — Kevin Pillar 2019 read as 266 G in CF, and Tom
 * Gorzelanny's 2009 (Pirates + Cubs) as 94 innings instead of 47. Every
 * parser here uses the combined split when there is one.
 */
import type { PlayerSeasonFacts } from "./archiveEligibility.js";

export const STATS_API = "https://statsapi.mlb.com/api/v1";

/** The parts of a statsapi person we read. */
export interface StatSplit {
  season?: string;
  /** Absent on the combined split of a player who changed teams. */
  team?: { id?: number; name?: string };
  numTeams?: number;
  sport?: { id?: number };
  position?: { abbreviation?: string };
  stat?: Record<string, unknown>;
}
export interface StatGroup {
  group?: { displayName?: string };
  splits?: StatSplit[];
}
export interface StatsPerson {
  id: number;
  fullName?: string;
  primaryPosition?: { abbreviation?: string };
  stats?: StatGroup[];
}

export interface SeasonLine {
  g: number; pa: number; hr: number; avg: string; r: number; rbi: number; sb: number;
  ip: number; w: number; sv: number; k: number; era: string;
}

export interface Career {
  /** MLB primary position (today's — fine for the rookie rule, wrong for matching). */
  primary: string;
  /** At-bats and innings by season. */
  abBy: Record<string, number>;
  ipBy: Record<string, number>;
}

export interface PlayerFacts {
  games: Record<string, number>;
  priorGames: Record<string, number>;
  career: Career;
  line: SeasonLine;
}

export const emptyLine = (): SeasonLine => ({ g: 0, pa: 0, hr: 0, avg: "", r: 0, rbi: 0, sb: 0, ip: 0, w: 0, sv: 0, k: 0, era: "" });
export const emptyCareer = (): Career => ({ primary: "", abBy: {}, ipBy: {} });

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** statsapi innings are outs after the dot: "201.2" is 201⅔. */
export function inningsToNumber(ip: unknown): number {
  const [whole, outs] = String(ip ?? "0").split(".");
  return num(whole) + num(outs) / 3;
}

/** The combined split(s) when the player changed teams, else every split. */
function seasonSplits(splits: StatSplit[]): StatSplit[] {
  const combined = splits.filter((sp) => !sp.team);
  return combined.length ? combined : splits;
}

/** Games by fielding position (C, 1B, …, LF, CF, RF, P, DH) for the hydrated season. */
export function parseFielding(person: StatsPerson): Record<string, number> {
  const combined: Record<string, number> = {};
  const byTeam: Record<string, number> = {};
  for (const grp of person.stats ?? []) {
    for (const sp of grp.splits ?? []) {
      const pos = sp.position?.abbreviation;
      const n = num(sp.stat?.games ?? sp.stat?.gamesPlayed);
      if (!pos || n <= 0) continue;
      const bucket = sp.team ? byTeam : combined;
      bucket[pos] = (bucket[pos] ?? 0) + n;
    }
  }
  const games: Record<string, number> = {};
  for (const pos of new Set([...Object.keys(combined), ...Object.keys(byTeam)])) games[pos] = combined[pos] ?? byTeam[pos];
  return games;
}

/** Primary position plus MLB at-bats and innings by season (yearByYear hydrate). */
export function parseCareer(person: StatsPerson): Career {
  const career: Career = { primary: person.primaryPosition?.abbreviation ?? "", abBy: {}, ipBy: {} };
  for (const grp of person.stats ?? []) {
    const kind = grp.group?.displayName;
    if (kind !== "hitting" && kind !== "pitching") continue;
    const bySeason = new Map<string, StatSplit[]>();
    for (const sp of grp.splits ?? []) {
      if (sp.sport && sp.sport.id !== 1) continue; // MLB only
      if (!sp.season) continue;
      bySeason.set(sp.season, [...(bySeason.get(sp.season) ?? []), sp]);
    }
    for (const [season, splits] of bySeason) {
      const total = seasonSplits(splits).reduce(
        (sum, sp) => sum + (kind === "hitting" ? num(sp.stat?.atBats) : inningsToNumber(sp.stat?.inningsPitched)), 0,
      );
      if (kind === "hitting") career.abBy[season] = total;
      else career.ipBy[season] = total;
    }
  }
  return career;
}

/** One season's hitting + pitching line, all teams combined (season hydrate). */
export function parseSeasonLine(person: StatsPerson): SeasonLine {
  const line = emptyLine();
  for (const grp of person.stats ?? []) {
    const kind = grp.group?.displayName;
    for (const sp of seasonSplits(grp.splits ?? [])) {
      const st = sp.stat ?? {};
      if (kind === "hitting") {
        line.g = Math.max(line.g, num(st.gamesPlayed));
        line.pa += num(st.plateAppearances); line.hr += num(st.homeRuns);
        line.r += num(st.runs); line.rbi += num(st.rbi); line.sb += num(st.stolenBases);
        if (typeof st.avg === "string") line.avg = st.avg;
      } else if (kind === "pitching") {
        line.g = Math.max(line.g, num(st.gamesPlayed));
        line.ip += inningsToNumber(st.inningsPitched);
        line.w += num(st.wins); line.sv += num(st.saves); line.k += num(st.strikeOuts);
        if (typeof st.era === "string") line.era = st.era;
      }
    }
  }
  return line;
}

const people = (ids: number[]) => `${STATS_API}/people?personIds=${ids.join(",")}`;

export const factsUrl = {
  fielding: (ids: number[], season: number) => `${people(ids)}&hydrate=stats(group=[fielding],type=[season],season=${season})`,
  career: (ids: number[]) => `${people(ids)}&hydrate=stats(group=[hitting,pitching],type=[yearByYear])`,
  line: (ids: number[], season: number) => `${people(ids)}&hydrate=stats(group=[hitting,pitching],type=[season],season=${season})`,
};

const sumBefore = (by: Record<string, number>, year: number) =>
  Object.entries(by).filter(([season]) => Number(season) < year).reduce((sum, [, v]) => sum + v, 0);

/** The facts the eligibility rules read, for the season `year`. */
export function toSeasonFacts(
  f: Pick<PlayerFacts, "games" | "priorGames" | "career">, year: number, keptFromSlot?: string,
): PlayerSeasonFacts {
  return {
    games: f.games,
    priorGames: f.priorGames,
    primaryPosition: f.career.primary,
    careerAbBefore: sumBefore(f.career.abBy, year),
    careerIpBefore: sumBefore(f.career.ipBy, year),
    keptFromSlot,
  };
}

export type GetJson = (url: string) => Promise<{ people?: StatsPerson[] }>;

/** Everything about a handful of players for one season, fetched live (four requests). */
export async function fetchPlayerFacts(ids: number[], year: number, getJson: GetJson): Promise<Map<number, PlayerFacts>> {
  const out = new Map<number, PlayerFacts>();
  if (ids.length === 0) return out;
  const [now, prior, career, line] = await Promise.all([
    getJson(factsUrl.fielding(ids, year)),
    getJson(factsUrl.fielding(ids, year - 1)),
    getJson(factsUrl.career(ids)),
    getJson(factsUrl.line(ids, year)),
  ]);
  const byId = (r: { people?: StatsPerson[] }) => new Map((r.people ?? []).map((p) => [p.id, p]));
  const [nowBy, priorBy, careerBy, lineBy] = [byId(now), byId(prior), byId(career), byId(line)];
  for (const id of ids) {
    out.set(id, {
      games: nowBy.has(id) ? parseFielding(nowBy.get(id)!) : {},
      priorGames: priorBy.has(id) ? parseFielding(priorBy.get(id)!) : {},
      career: careerBy.has(id) ? parseCareer(careerBy.get(id)!) : emptyCareer(),
      line: lineBy.has(id) ? parseSeasonLine(lineBy.get(id)!) : emptyLine(),
    });
  }
  return out;
}
