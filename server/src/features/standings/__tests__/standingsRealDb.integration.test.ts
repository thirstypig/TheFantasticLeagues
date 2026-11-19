import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../../db/prisma.js";
import { isLocalThrowawayDbUrl } from "../../../test-support/dbSafety.js";
import {
  computeTeamStatsFromDb,
  computeStandingsFromStats,
  getSeasonStandings,
  clearStandingsCache,
  type TeamStatRow,
} from "../services/standingsService.js";

/**
 * Standings against a REAL Postgres: every query's WHERE clause is exercised.
 *
 * Why this exists: every other standings test mocks Prisma, and a mocked test
 * receives whatever rows it hands itself regardless of the WHERE clause (memory:
 * "a mock cannot catch a wrong query", three precedents on 2026-08-31). Until now
 * the only guard on a standings change was a hand-run prod before/after dump
 * (#469, #501, #513).
 *
 * The expected numbers below are WORKED BY HAND from the attribution rules, not
 * captured from the code's output — so a regression fails here instead of being
 * locked in. Each fixture targets one rule, and each rule names the bug it catches:
 *
 *   hTrade   B → C on 04-15 (strictly mid-P1)  → P1 scored from daily rows inside each
 *            ownership window, release day goes to the NEW owner (half-open, #286);
 *            its P1 PlayerStatsPeriod row must be ignored. In P2 it is C's via PSP.
 *   hIL      IL_STASH 04-20, IL_ACTIVATE 05-10 → counts in P1 (active at P1 start),
 *            excluded for all of P2 (on IL at P2 start).
 *   hDrop    released 05-01 (P2 start)          → credited in P1, nobody gets P2 (#242).
 *   hMop     outfielder with pitching stats     → his pitching never counts (PSP path);
 *            hTrade's mop-up inning on 04-20 covers the daily path.
 *   hDecoy   rostered in ANOTHER league, with a PSP row for our P1 → never counts.
 *   h2       ALSO owned in the other league, picked up there mid-P1 → must not
 *            change his routing or owner here (roster query must filter by league).
 *   h1 decoy IL_STASH in the OTHER league      → must not bench h1 here (#505).
 *   hFA      free agent with a PSP row         → never counts.
 *   P3       status "pending" with huge stats   → excluded from the season.
 *
 * Gated with the same fail-closed guard as the other DB suites: runs only against
 * an explicit local throwaway DB with ALLOW_DESTRUCTIVE_DB_TESTS=1 (and in the CI
 * db-integration job). Scoped: it creates and deletes only its own rows.
 */
const DB_OK =
  isLocalThrowawayDbUrl(process.env.DATABASE_URL) &&
  process.env.ALLOW_DESTRUCTIVE_DB_TESTS === "1";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

type Line = Partial<Record<"AB" | "H" | "R" | "HR" | "RBI" | "SB" | "W" | "SV" | "K" | "IP" | "ER" | "BB_H", number>>;

describe.skipIf(!DB_OK)("standings — real-Postgres attribution", () => {
  const tag = `standings-it-${process.pid}-${Date.now()}`;
  const franchiseIds: number[] = [];
  const leagueIds: number[] = [];
  const playerIds: number[] = [];
  let leagueId: number;
  let teamA: number, teamB: number, teamC: number;
  let p1Id: number, p2Id: number;

  beforeAll(async () => {
    const mkLeague = async (suffix: string) => {
      const fr = await prisma.franchise.create({ data: { name: `${tag}-${suffix}` } });
      franchiseIds.push(fr.id);
      const lg = await prisma.league.create({
        data: { name: `${tag}-${suffix}`, season: 2026, sport: "MLB", draftMode: "AUCTION", franchiseId: fr.id },
      });
      leagueIds.push(lg.id);
      return lg.id;
    };
    leagueId = await mkLeague("main");
    const decoyLeagueId = await mkLeague("decoy");

    // Standard 5x5, set explicitly so the test doesn't lean on defaults.
    await prisma.leagueRule.createMany({
      data: [
        { leagueId, category: "scoring", key: "hitting_stats", value: JSON.stringify(["R", "HR", "RBI", "SB", "AVG"]), label: "Hitting" },
        { leagueId, category: "scoring", key: "pitching_stats", value: JSON.stringify(["W", "SV", "K", "ERA", "WHIP"]), label: "Pitching" },
      ],
    });

    // Created in A, B, C order: teams are returned by id.
    teamA = (await prisma.team.create({ data: { leagueId, name: "Alpha", code: "AAA" } })).id;
    teamB = (await prisma.team.create({ data: { leagueId, name: "Bravo", code: "BBB" } })).id;
    teamC = (await prisma.team.create({ data: { leagueId, name: "Charlie", code: "CCC" } })).id;
    const teamX = (await prisma.team.create({ data: { leagueId: decoyLeagueId, name: "Decoy", code: "XXX" } })).id;

    const mkPeriod = async (name: string, start: string, end: string, status: string) =>
      (await prisma.period.create({ data: { leagueId, name, startDate: d(start), endDate: d(end), status } })).id;
    p1Id = await mkPeriod("P1", "2026-04-01", "2026-04-30", "completed");
    p2Id = await mkPeriod("P2", "2026-05-01", "2026-05-31", "active");
    const p3Id = await mkPeriod("P3", "2026-06-01", "2026-06-30", "pending");

    const mkPlayer = async (name: string, pos: string) => {
      const p = await prisma.player.create({ data: { name: `${tag} ${name}`, posPrimary: pos, posList: pos } });
      playerIds.push(p.id);
      return p.id;
    };
    const h1 = await mkPlayer("h1", "OF");
    const h2 = await mkPlayer("h2", "1B");
    const h3 = await mkPlayer("h3", "SS");
    const p1 = await mkPlayer("p1", "P");
    const p2 = await mkPlayer("p2", "P");
    const p3 = await mkPlayer("p3", "P");
    const hTrade = await mkPlayer("hTrade", "OF");
    const hIL = await mkPlayer("hIL", "OF");
    const hDrop = await mkPlayer("hDrop", "OF");
    const hMop = await mkPlayer("hMop", "OF");
    const hDecoy = await mkPlayer("hDecoy", "OF");
    const hFA = await mkPlayer("hFA", "OF");

    const season = d("2026-03-01");
    await prisma.roster.createMany({
      data: [
        { teamId: teamA, playerId: h1, acquiredAt: season, source: "test" },
        { teamId: teamA, playerId: p1, acquiredAt: season, source: "test" },
        { teamId: teamA, playerId: hIL, acquiredAt: season, source: "test" },
        { teamId: teamA, playerId: hDrop, acquiredAt: season, releasedAt: d("2026-05-01"), source: "test" },
        { teamId: teamA, playerId: hMop, acquiredAt: season, source: "test" },
        { teamId: teamB, playerId: h2, acquiredAt: season, source: "test" },
        { teamId: teamB, playerId: p2, acquiredAt: season, source: "test" },
        { teamId: teamB, playerId: hTrade, acquiredAt: season, releasedAt: d("2026-04-15"), source: "test" },
        { teamId: teamC, playerId: h3, acquiredAt: season, source: "test" },
        { teamId: teamC, playerId: p3, acquiredAt: season, source: "test" },
        { teamId: teamC, playerId: hTrade, acquiredAt: d("2026-04-15"), source: "test" },
        { teamId: teamX, playerId: hDecoy, acquiredAt: season, source: "test" },
        // The same MLB player can be owned in two leagues. Picked up mid-P1 over
        // there: a roster query without the league filter would route h2 to the
        // daily path in P1 and hand his P2 to the decoy team.
        { teamId: teamX, playerId: h2, acquiredAt: d("2026-04-10"), source: "test" },
      ],
    });

    let n = 0;
    const ilEvent = (lg: number, playerId: number, transactionType: string, effDate: string) => ({
      rowHash: `${tag}-${n++}`, leagueId: lg, season: 2026, playerId, transactionType, effDate: d(effDate),
    });
    await prisma.transactionEvent.createMany({
      data: [
        ilEvent(leagueId, hIL, "IL_STASH", "2026-04-20"),
        ilEvent(leagueId, hIL, "IL_ACTIVATE", "2026-05-10"),
        ilEvent(decoyLeagueId, h1, "IL_STASH", "2026-03-15"),
      ],
    });

    const psp = (periodId: number, playerId: number, s: Line) => ({ periodId, playerId, ...s });
    await prisma.playerStatsPeriod.createMany({
      data: [
        // P1
        psp(p1Id, h1, { AB: 100, H: 30, R: 20, HR: 5, RBI: 18, SB: 2 }),
        psp(p1Id, h2, { AB: 100, H: 25, R: 15, HR: 8, RBI: 22, SB: 1 }),
        psp(p1Id, h3, { AB: 80, H: 28, R: 12, HR: 2, RBI: 10, SB: 6 }),
        psp(p1Id, hIL, { AB: 50, H: 10, R: 5, HR: 1, RBI: 4, SB: 0 }),
        psp(p1Id, hDrop, { AB: 40, H: 12, R: 6, HR: 2, RBI: 7, SB: 1 }),
        psp(p1Id, hMop, { AB: 60, H: 15, R: 8, HR: 3, RBI: 9, SB: 3, IP: 2, ER: 5, K: 1, BB_H: 6 }),
        psp(p1Id, hTrade, { AB: 30, H: 9, R: 4, HR: 2, RBI: 6, SB: 2 }), // must be IGNORED (daily path)
        psp(p1Id, p1, { W: 3, SV: 0, K: 30, IP: 30, ER: 10, BB_H: 33 }),
        psp(p1Id, p2, { W: 2, SV: 5, K: 25, IP: 20, ER: 4, BB_H: 24 }),
        psp(p1Id, p3, { W: 4, SV: 2, K: 40, IP: 36, ER: 16, BB_H: 45 }),
        psp(p1Id, hDecoy, { AB: 100, H: 50, R: 40, HR: 20, RBI: 50, SB: 20 }),
        psp(p1Id, hFA, { AB: 100, H: 40, R: 30, HR: 10, RBI: 30, SB: 10 }),
        // P2
        psp(p2Id, h1, { AB: 90, H: 27, R: 18, HR: 4, RBI: 15, SB: 3 }),
        psp(p2Id, h2, { AB: 95, H: 30, R: 20, HR: 7, RBI: 21, SB: 0 }),
        psp(p2Id, h3, { AB: 85, H: 20, R: 10, HR: 1, RBI: 8, SB: 5 }),
        psp(p2Id, hIL, { AB: 40, H: 14, R: 9, HR: 3, RBI: 10, SB: 2 }),
        psp(p2Id, hDrop, { AB: 30, H: 10, R: 5, HR: 1, RBI: 5, SB: 1 }),
        psp(p2Id, hMop, { AB: 50, H: 10, R: 5, HR: 2, RBI: 6, SB: 1, IP: 1, ER: 3, BB_H: 2 }),
        psp(p2Id, hTrade, { AB: 70, H: 22, R: 11, HR: 4, RBI: 12, SB: 4 }),
        psp(p2Id, p1, { W: 2, SV: 1, K: 28, IP: 27, ER: 9, BB_H: 30 }),
        psp(p2Id, p2, { W: 3, SV: 6, K: 22, IP: 18, ER: 2, BB_H: 18 }),
        psp(p2Id, p3, { W: 1, SV: 0, K: 35, IP: 33, ER: 15, BB_H: 40 }),
        psp(p2Id, hDecoy, { AB: 100, H: 50, R: 40, HR: 20, RBI: 50, SB: 20 }),
        // P3 is pending: would make C run away with the season if it were counted.
        psp(p3Id, h3, { AB: 500, H: 300, R: 300, HR: 100, RBI: 300, SB: 100 }),
        psp(p3Id, p3, { W: 50, SV: 50, K: 500, IP: 100, ER: 1, BB_H: 10 }),
      ],
    });

    await prisma.playerStatsDaily.createMany({
      data: [
        { playerId: hTrade, gameDate: d("2026-03-28"), AB: 4, H: 4, R: 4, HR: 4, RBI: 4, SB: 4 }, // before P1: nobody
        { playerId: hTrade, gameDate: d("2026-04-10"), AB: 4, H: 2, R: 1, HR: 1, RBI: 3, SB: 0 }, // B
        { playerId: hTrade, gameDate: d("2026-04-15"), AB: 5, H: 1, R: 1, HR: 0, RBI: 1, SB: 1 }, // release day → C
        // C, plus a mop-up inning that must NOT count (he's an outfielder).
        { playerId: hTrade, gameDate: d("2026-04-20"), AB: 3, H: 2, R: 2, HR: 1, RBI: 2, SB: 1, IP: 1, ER: 4, BB_H: 3 },
      ],
    });
  });

  afterAll(async () => {
    if (!DB_OK) return;
    clearStandingsCache();
    await prisma.transactionEvent.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.playerStatsDaily.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.playerStatsPeriod.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.roster.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.leagueRule.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.period.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.team.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await prisma.league.deleteMany({ where: { id: { in: leagueIds } } });
    await prisma.franchise.deleteMany({ where: { id: { in: franchiseIds } } });
    await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
  });

  const counting = ["AB", "H", "R", "HR", "RBI", "SB", "W", "S", "K", "IP", "ER", "BB_H"] as const;
  const pick = (rows: TeamStatRow[], teamId: number) => {
    const row = rows.find((r) => r.team.id === teamId);
    if (!row) throw new Error(`no row for team ${teamId}`);
    return Object.fromEntries(counting.map((k) => [k, row.stats[k]]));
  };
  const rate = (rows: TeamStatRow[], teamId: number, key: "AVG" | "ERA" | "WHIP") =>
    rows.find((r) => r.team.id === teamId)!.stats[key];

  const CATEGORIES = [
    { key: "R", lowerIsBetter: false }, { key: "HR", lowerIsBetter: false },
    { key: "RBI", lowerIsBetter: false }, { key: "SB", lowerIsBetter: false },
    { key: "AVG", lowerIsBetter: false }, { key: "W", lowerIsBetter: false },
    { key: "SV", lowerIsBetter: false }, { key: "K", lowerIsBetter: false },
    { key: "ERA", lowerIsBetter: true }, { key: "WHIP", lowerIsBetter: true },
  ];
  const pointsOf = (rows: TeamStatRow[]) =>
    Object.fromEntries(computeStandingsFromStats(rows, CATEGORIES).map((s) => [s.teamId, s.points]));

  it("P1: mid-period trade split by ownership window, IL and drop rules, decoys ignored", async () => {
    const rows = await computeTeamStatsFromDb(leagueId, p1Id);
    expect(rows.map((r) => r.team.id)).toEqual([teamA, teamB, teamC]);

    // A = h1 + hIL (active at P1 start) + hDrop (held on 04-30) + hMop's HITTING only; p1.
    // h1 counts in full: the IL_STASH in the decoy league must not bench him.
    expect(pick(rows, teamA)).toEqual({ AB: 250, H: 67, R: 39, HR: 11, RBI: 38, SB: 6, W: 3, S: 0, K: 30, IP: 30, ER: 10, BB_H: 33 });
    // B = h2 + hTrade's daily line on 04-10 only (released 04-15, exclusive); p2.
    expect(pick(rows, teamB)).toEqual({ AB: 104, H: 27, R: 16, HR: 9, RBI: 25, SB: 1, W: 2, S: 5, K: 25, IP: 20, ER: 4, BB_H: 24 });
    // C = h3 + hTrade's daily lines on 04-15 and 04-20 (not his P1 PSP row); p3.
    expect(pick(rows, teamC)).toEqual({ AB: 88, H: 31, R: 15, HR: 3, RBI: 13, SB: 8, W: 4, S: 2, K: 40, IP: 36, ER: 16, BB_H: 45 });

    expect(rate(rows, teamA, "AVG")).toBeCloseTo(67 / 250, 10);
    expect(rate(rows, teamA, "ERA")).toBeCloseTo(3.0, 10);
    expect(rate(rows, teamB, "WHIP")).toBeCloseTo(1.2, 10);
    expect(rate(rows, teamC, "ERA")).toBeCloseTo(4.0, 10);

    // R A>B>C, HR A>B>C, RBI A>B>C, SB C>A>B, AVG C>A>B,
    // W C>A>B, SV B>C>A, K C>A>B, ERA B<A<C, WHIP A<B<C.
    expect(pointsOf(rows)).toEqual({ [teamA]: 23, [teamB]: 18, [teamC]: 19 });
  });

  it("P2: IL at period start excludes the whole period, boundary drop credits nobody", async () => {
    const rows = await computeTeamStatsFromDb(leagueId, p2Id);

    // A = h1 + hMop's hitting. hIL was on IL on 05-01 (activated 05-10 → still out
    // for P2); hDrop left on 05-01, so no team holds him on 05-31.
    expect(pick(rows, teamA)).toEqual({ AB: 140, H: 37, R: 23, HR: 6, RBI: 21, SB: 4, W: 2, S: 1, K: 28, IP: 27, ER: 9, BB_H: 30 });
    // B = h2 only: hTrade's B row ended in April.
    expect(pick(rows, teamB)).toEqual({ AB: 95, H: 30, R: 20, HR: 7, RBI: 21, SB: 0, W: 3, S: 6, K: 22, IP: 18, ER: 2, BB_H: 18 });
    // C = h3 + hTrade via PSP (boundary-aligned for P2).
    expect(pick(rows, teamC)).toEqual({ AB: 155, H: 42, R: 21, HR: 5, RBI: 20, SB: 9, W: 1, S: 0, K: 35, IP: 33, ER: 15, BB_H: 40 });

    // RBI is a deliberate A/B tie at 21 → 2.5 points each.
    expect(pointsOf(rows)).toEqual({ [teamA]: 20.5, [teamB]: 23.5, [teamC]: 16 });
  });

  it("season: sums active + completed periods only, and matches the per-period path", async () => {
    clearStandingsCache(leagueId);
    const season = await getSeasonStandings(leagueId);

    expect(season.periodIds).toEqual([p1Id, p2Id]); // P3 (pending) excluded
    expect(season.seasonRows.map((r) => [r.teamId, r.totalPoints, r.rank])).toEqual([
      [teamA, 43.5, 1],
      [teamB, 41.5, 2],
      [teamC, 35, 3],
    ]);

    // The batched season loader must agree with computeTeamStatsFromDb row for row
    // (todo #305 claims parity; this holds it to that against real queries).
    const perPeriod = [await computeTeamStatsFromDb(leagueId, p1Id), await computeTeamStatsFromDb(leagueId, p2Id)];
    season.periodData.forEach((pd, i) => {
      for (const t of [teamA, teamB, teamC]) expect(pick(pd.teamStats, t)).toEqual(pick(perPeriod[i], t));
    });
  });
});
