// server/src/features/players/services/playerCardService.ts
import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import { mlbGetJson, fetchMlbTeamsMap } from "../../../lib/mlbApi.js";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";
/** Card responses are cached for 30 minutes (SQLite mlbCache). */
const CARD_TTL_SECONDS = 30 * 60;

export type StatGroup = "hitting" | "pitching";
export type StatLine = Record<string, number | string>;
export type RangeKey = "last7" | "last14" | "last30" | "season" | "lastSeason";
export type GroupStats = Partial<Record<StatGroup, StatLine | null>>;

export type GameRow = {
  date: string;
  opp: string;
  home: boolean;
  line: StatLine;
};

export type PlayerCardData = {
  mlbId: number;
  /** Prisma Player.id, or null when this mlbId isn't in our Player table. */
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
};

// ── Date helpers (calendar days in US Eastern) ───────────────────

function etDate(d: Date): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

// ── Split selection ──────────────────────────────────────────────

function ipToOuts(ip: unknown): number {
  const [w, f = "0"] = String(ip ?? "0").split(".");
  return Number(w) * 3 + Number(f);
}

function outsToIp(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

const rate3 = (n: number, d: number) =>
  d > 0 ? (n / d).toFixed(3).replace(/^0(?=\.)/, "") : ".000";
const rate2 = (n: number, d: number) => (d > 0 ? (n / d).toFixed(2) : "0.00");

function sumSplits(stats: StatLine[], group: StatGroup): StatLine {
  const out: Record<string, number | string> = {};
  for (const st of stats) {
    for (const [k, v] of Object.entries(st)) {
      if (typeof v === "number") out[k] = ((out[k] as number) ?? 0) + v;
    }
  }
  if (group === "hitting") {
    out.avg = rate3(Number(out.hits ?? 0), Number(out.atBats ?? 0));
  } else {
    const outs = stats.reduce((a, s) => a + ipToOuts(s.inningsPitched), 0);
    const ip = outs / 3;
    out.inningsPitched = outsToIp(outs);
    out.era = rate2(Number(out.earnedRuns ?? 0) * 9, ip);
    out.whip = rate2(Number(out.hits ?? 0) + Number(out.baseOnBalls ?? 0), ip);
  }
  return out;
}

/**
 * Choose the MLB-only stat line from a statsapi splits array.
 * - sport.id 1 = MLB; sport.id 0 = "All" (may include minors) is ignored.
 * - several MLB splits (traded player): take the aggregate with no `team`;
 *   if every split carries a team, sum counting stats and recompute rates.
 */
function pickSplit(splits: any[] | undefined, group: StatGroup): StatLine | null {
  if (!Array.isArray(splits) || splits.length === 0) return null;
  // A split with no sport is not trusted as MLB unless it is the only one.
  const mlb =
    splits.length === 1
      ? splits
      : splits.filter((s) => s?.sport?.id === 1);
  const usable = mlb.filter((s) => s?.stat);
  if (usable.length === 0) return null;
  if (usable.length === 1) return usable[0].stat as StatLine;
  const aggregate = usable.find((s) => !s.team);
  if (aggregate) return aggregate.stat as StatLine;
  return sumSplits(usable.map((s) => s.stat as StatLine), group);
}

function firstSplits(resp: any): any[] {
  return resp?.stats?.[0]?.splits ?? [];
}

// ── Main ─────────────────────────────────────────────────────────

export async function buildPlayerCard(
  mlbId: number,
  leagueId: number,
  today: Date,
): Promise<PlayerCardData> {
  const get = <T = any>(url: string) => mlbGetJson<T>(url, CARD_TTL_SECONDS);

  const endDate = addDays(etDate(today), -1);
  const season = Number(etDate(today).slice(0, 4));
  const todayEt = etDate(today);

  const [personResp, teamsMap, rosterRow, playerRow] = await Promise.all([
    get(`${MLB_BASE}/people/${mlbId}?hydrate=currentTeam`),
    fetchMlbTeamsMap().catch(() => ({}) as Record<number, string>),
    prisma.roster.findFirst({
      where: { releasedAt: null, player: { mlbId }, team: { leagueId } },
      select: { team: { select: { id: true, name: true, code: true } } },
    }),
    prisma.player.findFirst({ where: { mlbId }, select: { id: true } }),
  ]);

  const person = personResp?.people?.[0];
  const posAbbr: string = person?.primaryPosition?.abbreviation ?? "";
  const posType: string = person?.primaryPosition?.type ?? "";
  const isTwoWay = posAbbr === "TWP" || posType === "Two-Way Player";
  const isPitcher = !isTwoWay && posType === "Pitcher";
  const groups: StatGroup[] = isTwoWay ? ["hitting", "pitching"] : isPitcher ? ["pitching"] : ["hitting"];

  const teamId: number | undefined = person?.currentTeam?.id;
  const abbr = (id: number | undefined, fallback?: string) =>
    id !== undefined ? (teamsMap as Record<number, string>)[id] ?? fallback ?? String(id) : fallback ?? "";

  const ranges: Array<{ key: RangeKey; url: (g: StatGroup) => string }> = [
    { key: "last7", url: (g) => byRange(g, addDays(endDate, -6)) },
    { key: "last14", url: (g) => byRange(g, addDays(endDate, -13)) },
    { key: "last30", url: (g) => byRange(g, addDays(endDate, -29)) },
    { key: "season", url: (g) => `${MLB_BASE}/people/${mlbId}/stats?stats=season&group=${g}&season=${season}` },
    { key: "lastSeason", url: (g) => `${MLB_BASE}/people/${mlbId}/stats?stats=season&group=${g}&season=${season - 1}` },
  ];
  function byRange(g: StatGroup, startDate: string) {
    return `${MLB_BASE}/people/${mlbId}/stats?stats=byDateRange&group=${g}&startDate=${startDate}&endDate=${endDate}&season=${season}`;
  }

  // Only the people/{id} lookup is fatal; every other call degrades to null/[].
  const soft = async <T,>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      logger.warn({ error: String(err), mlbId, label }, "Player card fetch failed; degrading");
      return fallback;
    }
  };

  const splitJobs = ranges.flatMap((r) =>
    groups.map(async (g) => ({
      key: r.key,
      g,
      stat: await soft<StatLine | null>(`${r.key}:${g}`, null, async () =>
        pickSplit(firstSplits(await get(r.url(g))), g),
      ),
    })),
  );
  const qualifying = (g: StatGroup, rows: any[]) =>
    rows.filter((s) => s?.date && s?.stat && (g !== "pitching" || Number(s.stat.gamesStarted) === 1));
  const logFor = (g: StatGroup, yr: number) =>
    soft<any[]>(`gameLog:${g}:${yr}`, [], async () =>
      firstSplits(await get(`${MLB_BASE}/people/${mlbId}/stats?stats=gameLog&group=${g}&season=${yr}`)),
    );
  const logJobs = groups.map(async (g) => {
    let rows = await logFor(g, season);
    if (qualifying(g, rows).length === 0) rows = await logFor(g, season - 1);
    return { g, splits: rows };
  });
  const nextGameJob: Promise<any> = teamId
    ? soft<any>("schedule", null, () =>
        get(`${MLB_BASE}/schedule?sportId=1&teamId=${teamId}&startDate=${todayEt}&endDate=${addDays(todayEt, 7)}`),
      )
    : Promise.resolve(null);

  const [splitResults, logResults, schedule] = await Promise.all([
    Promise.all(splitJobs),
    Promise.all(logJobs),
    nextGameJob,
  ]);

  const splits = {} as Record<RangeKey, GroupStats>;
  for (const r of ranges) splits[r.key] = {};
  for (const { key, g, stat } of splitResults) splits[key][g] = stat;

  const recent: Partial<Record<StatGroup, GameRow[]>> = {};
  for (const { g, splits: log } of logResults) {
    const eligible = qualifying(g, log as any[]);
    recent[g] = eligible
      .slice(-(g === "pitching" ? 3 : 5))
      .reverse()
      .map((s) => ({
        date: s.date as string,
        opp: abbr(s.opponent?.id, s.opponent?.name),
        home: Boolean(s.isHome),
        line: s.stat as StatLine,
      }));
  }

  let nextGame: PlayerCardData["nextGame"] = null;
  if (schedule && teamId) {
    const nowMs = today.getTime();
    const games: any[] = (schedule.dates ?? []).flatMap((d: any) => d.games ?? []);
    const upcoming = games
      .filter((gm) => gm?.gameDate && new Date(gm.gameDate).getTime() >= nowMs)
      .sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime())[0];
    if (upcoming) {
      const home = upcoming.teams?.home?.team?.id === teamId;
      const other = home ? upcoming.teams?.away?.team : upcoming.teams?.home?.team;
      nextGame = { opp: abbr(other?.id, other?.name), home, startUtc: upcoming.gameDate };
    }
  }

  return {
    mlbId,
    playerId: playerRow?.id ?? null,
    name: person?.fullName ?? "",
    pos: posAbbr,
    mlbTeam: teamId !== undefined ? abbr(teamId) : null,
    isPitcher,
    isTwoWay,
    fantasyTeam: rosterRow?.team ?? null,
    nextGame,
    splits,
    recent,
  };
}
