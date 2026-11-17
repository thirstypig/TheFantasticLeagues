/**
 * Batched season compute (todo #305).
 *
 * `getSeasonStandings` loads every period's rosters / PSP / daily stats / IL
 * events in one query per table and cuts each period out in memory. The
 * single-period `computeTeamStatsFromDb` still queries one period at a time.
 * Both must give byte-identical results, so these tests run them against an
 * in-memory fake Prisma that EVALUATES the WHERE / ORDER BY clauses each path
 * sends (a mock that hands back fixed rows can't catch a wrong query).
 *
 * The worlds below cover mid-period drops and adds (hybrid PSP + daily),
 * trades at and inside period boundaries, same-day drop-and-re-add, IL stints
 * (including a same-day IL_STASH + IL_ACTIVATE), time-of-day acquisition
 * stamps, a period with no PSP rows yet (pure daily), IP in thirds, and a
 * second league sharing the same players.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CATEGORY_CONFIG } from "../../../lib/sportConfig.js";

type Row = Record<string, any>;
interface World {
  period: Row[];
  team: Row[];
  roster: Row[];
  transactionEvent: Row[];
  playerStatsPeriod: Row[];
  playerStatsDaily: Row[];
  player: Row[];
}

const fake = vi.hoisted(() => {
  const state: { world: any; calls: Record<string, number> } = { world: null, calls: {} };

  const cmp = (a: any, b: any) => {
    const x = a instanceof Date ? a.getTime() : a;
    const y = b instanceof Date ? b.getTime() : b;
    return x < y ? -1 : x > y ? 1 : 0;
  };
  const isOps = (c: any) =>
    c !== null && typeof c === "object" && !(c instanceof Date) && !Array.isArray(c);

  function matches(row: any, where: any): boolean {
    if (!where) return true;
    return Object.entries(where).every(([key, cond]: [string, any]) => {
      if (key === "OR") return cond.some((c: any) => matches(row, c));
      if (key === "team") {
        const team = state.world.team.find((t: any) => t.id === row.teamId);
        return team !== undefined && matches(team, cond);
      }
      const v = row[key];
      if (cond === null) return v === null;
      if (!isOps(cond)) return cmp(v, cond) === 0;
      return Object.entries(cond).every(([op, arg]: [string, any]) => {
        switch (op) {
          case "in": return arg.some((a: any) => cmp(v, a) === 0);
          case "not": return arg === null ? v !== null : cmp(v, arg) !== 0;
          case "lte": return v !== null && cmp(v, arg) <= 0;
          case "gte": return v !== null && cmp(v, arg) >= 0;
          case "lt": return v !== null && cmp(v, arg) < 0;
          case "gt": return v !== null && cmp(v, arg) > 0;
          default: throw new Error(`fake prisma: unsupported operator ${op}`);
        }
      });
    });
  }

  function sort(rows: any[], orderBy: any): any[] {
    if (!orderBy) return rows; // unordered: table order, like a heap scan
    const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]).map((o: any) => Object.entries(o)[0]);
    return [...rows].sort((a, b) => {
      for (const [k, dir] of keys as [string, string][]) {
        const c = cmp(a[k], b[k]);
        if (c !== 0) return dir === "desc" ? -c : c;
      }
      return 0; // stable: remaining ties keep table order
    });
  }

  function project(row: any, select: any): any {
    if (!select) return { ...row };
    const out: any = {};
    for (const [k, v] of Object.entries(select) as [string, any][]) {
      if (v === true) out[k] = row[k];
      else if (k === "player") {
        out.player = project(state.world.player.find((p: any) => p.id === row.playerId), v.select);
      } else throw new Error(`fake prisma: unsupported select ${k}`);
    }
    return out;
  }

  function delegate(model: string) {
    const bump = (fn: string) => { const k = `${model}.${fn}`; state.calls[k] = (state.calls[k] ?? 0) + 1; };
    const rows = () => state.world[model] as any[];
    return {
      findMany: async (args: any = {}) => {
        bump("findMany");
        return sort(rows().filter((r) => matches(r, args.where)), args.orderBy).map((r) => project(r, args.select));
      },
      findUnique: async (args: any) => {
        bump("findUnique");
        const r = rows().find((x) => matches(x, args.where));
        return r ? project(r, args.select) : null;
      },
      count: async (args: any = {}) => {
        bump("count");
        return rows().filter((r) => matches(r, args.where)).length;
      },
    };
  }

  const prisma = Object.fromEntries(
    ["period", "team", "roster", "transactionEvent", "playerStatsPeriod", "playerStatsDaily"].map((m) => [m, delegate(m)]),
  );
  return { state, prisma };
});

vi.mock("../../../db/prisma.js", () => ({ prisma: fake.prisma }));

const mockGetLeagueCategories = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/leagueCategories.js", async () => {
  const actual = await vi.importActual<any>("../../../lib/leagueCategories.js");
  mockGetLeagueCategories.mockResolvedValue(actual.SCORABLE_CATEGORIES);
  return { ...actual, getLeagueCategories: mockGetLeagueCategories };
});

const { computeTeamStatsFromDb, getSeasonStandings, clearStandingsCache, computeStandingsFromStats } =
  await import("../services/standingsService.js");

// ─── World generation ────────────────────────────────────────────────────

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const LEAGUE = 1;
const OTHER_LEAGUE = 2;

// Noon-UTC period ends mirror periods/routes.ts storage.
const PERIODS = [
  { id: 11, leagueId: LEAGUE, status: "completed", startDate: utc("2026-04-01"), endDate: new Date("2026-04-28T12:00:00Z") },
  { id: 12, leagueId: LEAGUE, status: "completed", startDate: utc("2026-04-29"), endDate: new Date("2026-05-26T12:00:00Z") },
  { id: 13, leagueId: LEAGUE, status: "active", startDate: utc("2026-05-27"), endDate: new Date("2026-06-23T12:00:00Z") },
  { id: 14, leagueId: LEAGUE, status: "pending", startDate: utc("2026-06-24"), endDate: new Date("2026-07-21T12:00:00Z") },
  { id: 21, leagueId: OTHER_LEAGUE, status: "completed", startDate: utc("2026-04-01"), endDate: new Date("2026-04-28T12:00:00Z") },
];

function statLine(r: () => number, pitcher: boolean) {
  const n = (max: number) => Math.floor(r() * (max + 1));
  return pitcher
    ? { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: n(1), SV: n(1), K: n(9), IP: n(21) / 3, ER: n(6), BB_H: n(10) }
    : { AB: n(5), H: n(3), R: n(2), HR: n(1), RBI: n(3), SB: n(1), W: 0, SV: 0, K: 0, IP: r() < 0.03 ? 1 / 3 : 0, ER: 0, BB_H: 0 };
}

/**
 * A random league season. `pspInActive` decides whether the active period has
 * PSP rows yet (false → that period is scored purely from daily stats).
 */
function randomWorld(seed: number, pspInActive: boolean): World {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const team = [
    ...[1, 2, 3, 4, 5].map((id) => ({ id, leagueId: LEAGUE, name: `Team ${id}`, code: id === 3 ? null : `T${id}` })),
    ...[6, 7].map((id) => ({ id, leagueId: OTHER_LEAGUE, name: `Other ${id}`, code: `O${id}` })),
  ];
  const positions = ["C", "1B", "SS", "OF", "OF", "DH", "SP", "SP", "RP", "P"];
  const player = Array.from({ length: 36 }, (_, i) => ({
    id: i + 1, mlbId: i % 9 === 0 ? null : 600000 + i, posPrimary: pick(positions),
  }));
  const isPitcher = (pid: number) => ["SP", "RP", "P"].includes(player[pid - 1].posPrimary);

  // Candidate move dates: period starts (boundary-aligned), mid-period days,
  // period end dates, and time-of-day stamps on a start date (todo #285).
  const moveDates = [
    utc("2026-04-01"), new Date("2026-04-01T17:30:00Z"), utc("2026-04-10"), utc("2026-04-17"),
    utc("2026-04-28"), utc("2026-04-29"), new Date("2026-04-29T09:15:00Z"), utc("2026-05-08"),
    utc("2026-05-08"), utc("2026-05-20"), utc("2026-05-27"), utc("2026-06-05"), utc("2026-06-23"),
    utc("2026-06-24"), utc("2026-07-01"),
  ];

  let rosterId = 0;
  const roster: Row[] = [];
  const open = new Map<number, Row>(); // playerId → open league-1 row
  const slot = (pid: number) => (r() < 0.1 ? "IL" : r() < 0.2 ? null : isPitcher(pid) ? "P" : "OF");
  for (const p of player) {
    if (r() < 0.15) continue; // free agent
    const row = {
      id: ++rosterId, teamId: 1 + Math.floor(r() * 5), playerId: p.id,
      acquiredAt: r() < 0.5 ? utc("2026-03-25") : new Date("2026-03-25T19:00:00Z"),
      releasedAt: null as Date | null, assignedPosition: slot(p.id),
    };
    roster.push(row);
    open.set(p.id, row);
  }
  // Moves: drop, add, trade, same-team drop-and-re-add, all on shared dates so
  // acquiredAt ties are common.
  const moves = 25 + Math.floor(r() * 20);
  for (let m = 0; m < moves; m++) {
    const d = pick(moveDates);
    const p = pick(player);
    const cur = open.get(p.id);
    if (cur) {
      if (cur.acquiredAt.getTime() >= d.getTime()) continue;
      cur.releasedAt = d;
      open.delete(p.id);
      if (r() < 0.7) {
        const to = r() < 0.25 ? cur.teamId : 1 + Math.floor(r() * 5);
        const row = { id: ++rosterId, teamId: to, playerId: p.id, acquiredAt: d, releasedAt: null, assignedPosition: slot(p.id) };
        roster.push(row);
        open.set(p.id, row);
      }
    } else {
      const row = { id: ++rosterId, teamId: 1 + Math.floor(r() * 5), playerId: p.id, acquiredAt: d, releasedAt: null, assignedPosition: slot(p.id) };
      roster.push(row);
      open.set(p.id, row);
    }
  }
  // The other league rosters some of the same players (stats are shared).
  for (const p of player.slice(0, 12)) {
    roster.push({ id: ++rosterId, teamId: pick([6, 7]), playerId: p.id, acquiredAt: utc("2026-03-25"), releasedAt: null, assignedPosition: null });
  }

  // IL history, incl. same-day stash+activate pairs, orphans, DROPs and null dates.
  let txId = 0;
  const transactionEvent: Row[] = [];
  // A fifth of the events belong to the other league (players are shared across leagues).
  for (let i = 0; i < 30; i++) {
    const p = pick(player).id;
    const d = pick(moveDates);
    const leagueId = r() < 0.8 ? LEAGUE : OTHER_LEAGUE;
    const kind = r();
    if (kind < 0.35) {
      transactionEvent.push({ id: ++txId, leagueId, playerId: p, transactionType: "IL_STASH", effDate: d });
      const close = r();
      const closeDate = r() < 0.3 ? d : new Date(d.getTime() + 9 * DAY);
      if (close < 0.45) transactionEvent.push({ id: ++txId, leagueId, playerId: p, transactionType: "IL_ACTIVATE", effDate: closeDate });
      else if (close < 0.6) transactionEvent.push({ id: ++txId, leagueId, playerId: p, transactionType: "IL_RELEASE", effDate: closeDate });
      else if (close < 0.75) transactionEvent.push({ id: ++txId, leagueId, playerId: p, transactionType: "DROP", effDate: closeDate });
    } else if (kind < 0.5) {
      transactionEvent.push({ id: ++txId, leagueId, playerId: p, transactionType: "IL_ACTIVATE", effDate: d });
    } else if (kind < 0.7) {
      transactionEvent.push({ id: ++txId, leagueId, playerId: p, transactionType: "DROP", effDate: d });
    } else if (kind < 0.8) {
      transactionEvent.push({ id: ++txId, leagueId, playerId: p, transactionType: "IL_STASH", effDate: null });
    }
  }

  const playerStatsDaily: Row[] = [];
  let dsId = 0;
  for (let t = utc("2026-03-28").getTime(); t <= utc("2026-07-25").getTime(); t += DAY) {
    for (const p of player) {
      if (r() < 0.55) playerStatsDaily.push({ id: ++dsId, playerId: p.id, gameDate: new Date(t), ...statLine(r, isPitcher(p.id)) });
    }
  }

  const playerStatsPeriod: Row[] = [];
  let psId = 0;
  for (const per of PERIODS) {
    if (per.status === "pending") continue;
    if (per.status === "active" && !pspInActive) continue;
    for (const p of player) {
      if (r() < 0.85) playerStatsPeriod.push({ id: ++psId, periodId: per.id, playerId: p.id, ...statLine(r, isPitcher(p.id)) });
    }
  }

  return { period: PERIODS.map((p) => ({ ...p })), team, roster, transactionEvent, playerStatsPeriod, playerStatsDaily, player };
}

/**
 * The same world with every table in a random order: models Postgres returning
 * unordered rows, and tied rows of an ordered query, in any order.
 */
function shuffled(world: World, seed: number): World {
  const r = rng(seed);
  const shuffle = (xs: Row[]) => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  return {
    ...world,
    roster: shuffle(world.roster), transactionEvent: shuffle(world.transactionEvent),
    playerStatsDaily: shuffle(world.playerStatsDaily), playerStatsPeriod: shuffle(world.playerStatsPeriod),
    team: shuffle(world.team), period: shuffle(world.period),
  };
}

function use(world: World) {
  fake.state.world = world;
  fake.state.calls = {};
  clearStandingsCache();
}
const totalCalls = () => Object.values(fake.state.calls).reduce((a, b) => a + b, 0);

async function season() {
  const { computedAt: _ignored, ...core } = await getSeasonStandings(LEAGUE);
  return core;
}

/** The old shape: one computeTeamStatsFromDb per scored period. */
async function seasonPerPeriod() {
  const periodIds = fake.state.world.period
    .filter((p: Row) => p.leagueId === LEAGUE && ["active", "completed"].includes(p.status))
    .sort((a: Row, b: Row) => a.startDate - b.startDate)
    .map((p: Row) => p.id);
  const periodData = [];
  for (const pid of periodIds) {
    const teamStats = await computeTeamStatsFromDb(LEAGUE, pid);
    periodData.push({ teamStats, standings: computeStandingsFromStats(teamStats, CATEGORY_CONFIG) });
  }
  return { periodIds, periodData };
}

beforeEach(async () => {
  clearStandingsCache();
  const actual = await vi.importActual<any>("../../../lib/leagueCategories.js");
  mockGetLeagueCategories.mockResolvedValue(actual.SCORABLE_CATEGORIES);
});

// ─── Tests ───────────────────────────────────────────────────────────────

describe("season standings use the league's categories", () => {
  it("scores each period over the league's 4 categories, not the global 10", async () => {
    const actual = await vi.importActual<any>("../../../lib/leagueCategories.js");
    const four = actual.SCORABLE_CATEGORIES.filter((c: any) => ["R", "HR", "W", "SV"].includes(c.key));
    use(randomWorld(3, false));
    mockGetLeagueCategories.mockResolvedValue(four);
    clearStandingsCache();

    const result = await season();

    expect(mockGetLeagueCategories).toHaveBeenCalledWith(LEAGUE);
    expect(result.periodData.length).toBeGreaterThan(0);
    for (const { teamStats, standings } of result.periodData) {
      expect(standings).toStrictEqual(computeStandingsFromStats(teamStats, four));
      // 4 categories, 2 teams-or-more: max points per team is 4 * teamCount.
      const max = 4 * teamStats.length;
      for (const row of standings) expect(row.points).toBeLessThanOrEqual(max);
    }
    const tenCat = computeStandingsFromStats(result.periodData[0].teamStats, CATEGORY_CONFIG);
    expect(result.periodData[0].standings).not.toStrictEqual(tenCat);
  });
});

describe("batched season standings == per-period computeTeamStatsFromDb (todo #305)", () => {
  const seeds = Array.from({ length: 40 }, (_, i) => i + 1);

  it.each(seeds)("random season, seed %i", async (seed) => {
    use(randomWorld(seed, seed % 2 === 0));
    const batched = await season();
    const perPeriod = await seasonPerPeriod();

    expect(batched.periodIds).toEqual(perPeriod.periodIds);
    expect(batched.periodIds).toEqual([11, 12, 13]); // pending + other league excluded
    // Byte-identical, key order included.
    expect(JSON.stringify(batched.periodData)).toBe(JSON.stringify(perPeriod.periodData));
    expect(batched.periodData).toStrictEqual(perPeriod.periodData);

    const totals = new Map<number, number>();
    for (const { standings } of perPeriod.periodData) {
      for (const s of standings) totals.set(s.teamId, (totals.get(s.teamId) ?? 0) + s.points);
    }
    for (const row of batched.seasonRows) expect(row.totalPoints).toBe(totals.get(row.teamId));
  });

  it("the random worlds exercise every scoring path", async () => {
    // Guard against a generator change silently dropping coverage.
    let hybridOrDaily = 0, ilExcluded = 0;
    for (const seed of seeds) {
      const w = randomWorld(seed, seed % 2 === 0);
      for (const per of w.period.filter((p) => p.leagueId === LEAGUE && p.status !== "pending")) {
        const startDay = per.startDate.getTime(), endDay = utc(per.endDate.toISOString().slice(0, 10)).getTime();
        const inside = (d: Date | null) => {
          if (!d) return false;
          const day = utc(d.toISOString().slice(0, 10)).getTime();
          return day > startDay && day < endDay;
        };
        if (w.roster.some((r) => inside(r.acquiredAt) || inside(r.releasedAt))) hybridOrDaily++;
      }
      if (w.transactionEvent.some((e) => e.transactionType === "IL_STASH" && e.effDate)) ilExcluded++;
    }
    expect(hybridOrDaily).toBeGreaterThan(60);
    expect(ilExcluded).toBe(seeds.length);
  });

  it("does not depend on the order the database returns rows in", async () => {
    for (const seed of [3, 8, 21]) {
      const world = randomWorld(seed, seed % 2 === 0);
      use(world);
      const a = await season();
      use(shuffled(world, seed * 7));
      const b = await season();
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      // And the single-period path agrees with itself under reordering.
      use(world);
      const pa = await computeTeamStatsFromDb(LEAGUE, 12);
      use(shuffled(world, seed * 11));
      const pb = await computeTeamStatsFromDb(LEAGUE, 12);
      expect(JSON.stringify(pb)).toBe(JSON.stringify(pa));
    }
  });

  it("a cold season compute issues at most 6 queries, however many periods", async () => {
    use(randomWorld(5, false));
    await season();
    expect(totalCalls()).toBeLessThanOrEqual(6);
    expect(fake.state.calls["roster.findMany"]).toBe(1);
    expect(fake.state.calls["playerStatsPeriod.findMany"]).toBe(1);
    expect(fake.state.calls["transactionEvent.findMany"]).toBe(1);
    expect(fake.state.calls["playerStatsDaily.findMany"]).toBe(1);

    fake.state.calls = {};
    await seasonPerPeriod();
    expect(totalCalls()).toBeGreaterThan(12); // the fan-out this replaces
  });

  it("zero scored periods is a single query", async () => {
    use({ ...randomWorld(1, true), period: [] });
    const s = await season();
    expect(s).toEqual({ periodIds: [], periodData: [], seasonRows: [] });
    expect(totalCalls()).toBe(1);
  });
});

describe("batched season standings: hand-checked attribution", () => {
  // One hitter per case so each team total is checkable by hand.
  const P1 = PERIODS[0], P2 = PERIODS[1];
  const ZERO = { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 };
  function world(): World {
    return {
      period: [P1, P2].map((p) => ({ ...p })),
      team: [1, 2, 3].map((id) => ({ id, leagueId: LEAGUE, name: `Team ${id}`, code: `T${id}` })),
      player: [1, 2, 3, 4, 5, 6].map((id) => ({ id, mlbId: 700000 + id, posPrimary: "OF" })),
      roster: [
        // 1: dropped by team 1 mid-P1 (04-10), added by team 2 the same day.
        { id: 1, teamId: 1, playerId: 1, acquiredAt: utc("2026-03-25"), releasedAt: utc("2026-04-10"), assignedPosition: "OF" },
        { id: 2, teamId: 2, playerId: 1, acquiredAt: utc("2026-04-10"), releasedAt: null, assignedPosition: "OF" },
        // 2: traded team 1 → team 3 exactly at the P2 boundary.
        { id: 3, teamId: 1, playerId: 2, acquiredAt: utc("2026-03-25"), releasedAt: utc("2026-04-29"), assignedPosition: "OF" },
        { id: 4, teamId: 3, playerId: 2, acquiredAt: utc("2026-04-29"), releasedAt: null, assignedPosition: "OF" },
        // 3: team 3 all season, stashed on IL before P2 and never activated.
        { id: 5, teamId: 3, playerId: 3, acquiredAt: utc("2026-03-25"), releasedAt: null, assignedPosition: "IL" },
        // 4: team 2, same-day IL stash + activate on the P2 start date — not on IL.
        { id: 6, teamId: 2, playerId: 4, acquiredAt: utc("2026-03-25"), releasedAt: null, assignedPosition: "OF" },
        // 5: team 1 stashes him on IL (04-05), drops him while on IL (04-12),
        //    and re-adds him at the P2 boundary (todo #312).
        { id: 7, teamId: 1, playerId: 5, acquiredAt: utc("2026-03-25"), releasedAt: utc("2026-04-12"), assignedPosition: "IL" },
        { id: 8, teamId: 1, playerId: 5, acquiredAt: utc("2026-04-29"), releasedAt: null, assignedPosition: "OF" },
        // 6: team 3 all season; only the OTHER league stashed him on IL (todo #313).
        { id: 9, teamId: 3, playerId: 6, acquiredAt: utc("2026-03-25"), releasedAt: null, assignedPosition: "OF" },
      ],
      transactionEvent: [
        { id: 1, leagueId: LEAGUE, playerId: 3, transactionType: "IL_STASH", effDate: utc("2026-04-20") },
        { id: 2, leagueId: LEAGUE, playerId: 4, transactionType: "IL_STASH", effDate: utc("2026-04-29") },
        { id: 3, leagueId: LEAGUE, playerId: 4, transactionType: "IL_ACTIVATE", effDate: utc("2026-04-29") },
        { id: 4, leagueId: LEAGUE, playerId: 5, transactionType: "IL_STASH", effDate: utc("2026-04-05") },
        { id: 5, leagueId: LEAGUE, playerId: 5, transactionType: "DROP", effDate: utc("2026-04-12") },
        { id: 6, leagueId: OTHER_LEAGUE, playerId: 6, transactionType: "IL_STASH", effDate: utc("2026-04-20") },
      ],
      playerStatsDaily: [
        { id: 1, playerId: 1, gameDate: utc("2026-04-05"), ...ZERO, R: 1 },  // team 1's
        { id: 2, playerId: 1, gameDate: utc("2026-04-10"), ...ZERO, R: 10 }, // release day → team 2
        { id: 3, playerId: 1, gameDate: utc("2026-04-20"), ...ZERO, R: 100 }, // team 2's
      ],
      playerStatsPeriod: [
        { id: 1, periodId: 11, playerId: 1, ...ZERO, R: 999 }, // ignored: player 1 is daily-routed in P1
        { id: 2, periodId: 11, playerId: 2, ...ZERO, HR: 2 },
        { id: 3, periodId: 12, playerId: 2, ...ZERO, HR: 5 },
        { id: 4, periodId: 11, playerId: 3, ...ZERO, RBI: 7 },
        { id: 5, periodId: 12, playerId: 3, ...ZERO, RBI: 70 },
        { id: 6, periodId: 12, playerId: 4, ...ZERO, SB: 3 },
        { id: 7, periodId: 12, playerId: 1, ...ZERO, R: 4 },
        { id: 8, periodId: 12, playerId: 5, ...ZERO, SB: 6 },
        { id: 9, periodId: 12, playerId: 6, ...ZERO, SB: 9 },
      ],
    };
  }
  const stat = (rows: { team: { id: number }; stats: Record<string, number> }[], teamId: number, key: string) =>
    rows.find((r) => r.team.id === teamId)!.stats[key];

  it("splits a mid-period move by day, credits boundary trades to the end owner, and excludes IL stints", async () => {
    use(world());
    const s = await season();
    const [p1, p2] = s.periodData.map((p) => p.teamStats);

    // Mid-P1 move: team 1 keeps its pre-drop day; the release day and later go to team 2.
    expect(stat(p1, 1, "R")).toBe(1);
    expect(stat(p1, 2, "R")).toBe(110);
    // P2: player 1 is boundary-aligned on team 2 → PSP.
    expect(stat(p2, 2, "R")).toBe(4);
    // Boundary trade: P1 PSP to team 1, P2 PSP to team 3.
    expect(stat(p1, 1, "HR")).toBe(2);
    expect(stat(p2, 3, "HR")).toBe(5);
    expect(stat(p2, 1, "HR")).toBe(0);
    // IL from 04-20: counted in P1 (not on IL at P1 start), excluded in P2.
    expect(stat(p1, 3, "RBI")).toBe(7);
    expect(stat(p2, 3, "RBI")).toBe(0);
    // Same-day stash + activate closes the stint at once: player 4 counts.
    expect(stat(p2, 2, "SB")).toBe(3);
    // #312: a DROP closes the IL stint, so the re-added player counts in P2.
    expect(stat(p2, 1, "SB")).toBe(6);
    // #313: another league's IL stash doesn't exclude this league's player.
    expect(stat(p2, 3, "SB")).toBe(9);

    expect(JSON.stringify(s.periodData)).toBe(JSON.stringify((await seasonPerPeriod()).periodData));
  });
});
