/**
 * PSD↔PSP differential tests (todo #244).
 *
 * The standings code has two stat-aggregation paths with intentionally
 * different attribution semantics for mid-period trades:
 *
 *   - `computeWithDailyStats` (PSD path): per-day ownership-window split.
 *     A player traded mid-period gets stats split by ownership window.
 *   - `computeWithPeriodStats` (PSP path): whole-period PSP credited to
 *     the team that held the player on `period.endDate`.
 *
 * Static-ownership scenarios — both paths MUST produce identical per-team
 * totals. Mid-period-trade scenarios — they WILL diverge by design (PSP
 * can't be split). This file pins both behaviors so future refactors don't
 * silently widen the gap.
 *
 * Compound doc: docs/solutions/logic-errors/closed-period-stat-attribution-uses-current-owner.md
 * (Prevention section calls this rule out: "add a paired test that runs BOTH
 *  paths on the same scenario and asserts they agree on per-team totals (within stat-granularity rounding)").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPeriodFindUnique = vi.fn();
const mockTeamFindMany = vi.fn();
const mockRosterFindMany = vi.fn();
const mockDailyFindMany = vi.fn();
const mockPeriodStatsFindMany = vi.fn();
const mockPeriodStatsCount = vi.fn();
const mockTransactionEventFindMany = vi.fn();

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    period: { findUnique: (...a: unknown[]) => mockPeriodFindUnique(...a) },
    team: { findMany: (...a: unknown[]) => mockTeamFindMany(...a) },
    roster: { findMany: (...a: unknown[]) => mockRosterFindMany(...a) },
    playerStatsDaily: {
      findMany: (...a: unknown[]) => mockDailyFindMany(...a),
      groupBy: vi.fn(),
    },
    playerStatsPeriod: {
      findMany: (...a: unknown[]) => mockPeriodStatsFindMany(...a),
      count: (...a: unknown[]) => mockPeriodStatsCount(...a),
    },
    transactionEvent: {
      findMany: (...a: unknown[]) => mockTransactionEventFindMany(...a),
    },
  },
}));

import { computeTeamStatsFromDb } from "../services/standingsService.js";

const PERIOD_START = new Date("2026-04-19T00:00:00.000Z");
// noon UTC — matches periods/routes.ts storage convention (new Date(date + "T12:00:00Z"))
const PERIOD_END = new Date("2026-05-16T12:00:00.000Z");
const ZERO_STATS = { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 };

function dailyRow(playerId: number, date: string, stats: Partial<typeof ZERO_STATS>) {
  return { playerId, gameDate: new Date(date), ...ZERO_STATS, ...stats };
}

beforeEach(() => {
  mockPeriodFindUnique.mockReset();
  mockTeamFindMany.mockReset();
  mockRosterFindMany.mockReset();
  mockDailyFindMany.mockReset();
  mockPeriodStatsFindMany.mockReset();
  mockPeriodStatsCount.mockReset();
  mockTransactionEventFindMany.mockReset();
  mockTransactionEventFindMany.mockResolvedValue([]);

  mockPeriodFindUnique.mockResolvedValue({ id: 36, startDate: PERIOD_START, endDate: PERIOD_END });
  // Synthetic IDs and names — avoid anchoring tests to production team records
  mockTeamFindMany.mockResolvedValue([
    { id: 1001, name: "Alpha", code: "AAA" },
    { id: 1002, name: "Bravo", code: "BBB" },
  ]);
});

// period/team mocks are persistent (mockResolvedValue); roster/stats mocks are
// Once-queued and order-sensitive. This helper centralises path-guard assertions
// so they can't drift out of sync between test cases.
//
// opts.pspUsesDailyFallback — set true for mid-period-pickup rosters. Since
// PR #374 the service falls back to computeWithDailyStats when hasMidPeriodPickup
// is true even when periodStatCount > 0, so the PSP run must get a daily mock
// instead of a period-stats mock.
async function runBothPaths(
  rosters: unknown[],
  dailies: unknown[],
  psp: unknown[],
  opts: { pspUsesDailyFallback?: boolean } = {},
) {
  mockRosterFindMany.mockResolvedValueOnce(rosters);
  mockPeriodStatsCount.mockResolvedValueOnce(0);
  mockDailyFindMany.mockResolvedValueOnce(dailies);
  const psdResult = await computeTeamStatsFromDb(20, 36);
  expect(mockDailyFindMany).toHaveBeenCalledTimes(1);
  expect(mockPeriodStatsFindMany).not.toHaveBeenCalled();

  mockRosterFindMany.mockResolvedValueOnce(rosters);
  mockPeriodStatsCount.mockResolvedValueOnce(1);
  if (opts.pspUsesDailyFallback) {
    mockDailyFindMany.mockResolvedValueOnce(dailies);
  } else {
    mockPeriodStatsFindMany.mockResolvedValueOnce(psp);
  }
  const pspResult = await computeTeamStatsFromDb(20, 36);
  if (opts.pspUsesDailyFallback) {
    // Mid-period pickup: PSP fell back to daily stats; period-stats path never reached
    expect(mockDailyFindMany).toHaveBeenCalledTimes(2);
    expect(mockPeriodStatsFindMany).not.toHaveBeenCalled();
  } else {
    // Static ownership: PSP used period stats
    expect(mockPeriodStatsFindMany).toHaveBeenCalledTimes(1);
    expect(mockDailyFindMany).toHaveBeenCalledTimes(1);
  }

  return { psdResult, pspResult };
}

describe("computeTeamStatsFromDb — PSD ↔ PSP differential", () => {
  describe("static ownership (no in-period trade)", () => {
    it("PSD and PSP agree on per-team totals when a player is held by one team for the whole period", async () => {
      // Player 1 on RGS for the entire period. Both paths should produce the
      // same per-team totals.
      const rosters = [
        {
          teamId: 1001, playerId: 1, acquiredAt: new Date("2026-03-22"),
          releasedAt: null,
          assignedPosition: "OF",
          player: { id: 1, mlbId: 1000, posPrimary: "OF" },
        },
      ];

      // PSD path: 3 days of stats summing to R=12, HR=4, RBI=8
      const dailies = [
        dailyRow(1, "2026-04-20", { R: 4, HR: 1, RBI: 3, AB: 4, H: 2 }),
        dailyRow(1, "2026-04-25", { R: 5, HR: 2, RBI: 3, AB: 4, H: 3 }),
        dailyRow(1, "2026-05-10", { R: 3, HR: 1, RBI: 2, AB: 4, H: 2 }),
      ];
      // PSP path: same totals as the per-day sum
      const psp = [{ playerId: 1, ...ZERO_STATS, R: 12, HR: 4, RBI: 8, AB: 12, H: 7 }];

      const { psdResult, pspResult } = await runBothPaths(rosters, dailies, psp);

      const psdRgs = psdResult.find(r => r.team.code === "AAA");
      const pspRgs = pspResult.find(r => r.team.code === "AAA");
      expect(psdRgs, "PSD: RGS not found in result").toBeDefined();
      expect(pspRgs, "PSP: RGS not found in result").toBeDefined();
      if (!psdRgs || !pspRgs) return;

      // Both paths credit RGS with the player's full-period stats.
      expect(psdRgs.R).toBe(12);
      expect(pspRgs.R).toBe(12);
      expect(psdRgs.HR).toBe(4);
      expect(pspRgs.HR).toBe(4);
      expect(psdRgs.RBI).toBe(8);
      expect(pspRgs.RBI).toBe(8);
    });

    it("PSD and PSP both produce zero credit when the only roster row is on IL at period start", async () => {
      // Player 2 on RGS but on IL since before the period. Both paths skip.
      const rosters = [
        {
          teamId: 1001, playerId: 2, acquiredAt: new Date("2026-03-22"),
          releasedAt: null,
          assignedPosition: "IL",
          player: { id: 2, mlbId: 2000, posPrimary: "P" },
        },
      ];
      const ilEvents = [
        { playerId: 2, transactionType: "IL_STASH", effDate: new Date("2026-04-10") },
      ];
      // Both paths feed stats (would be wrong to credit; pin that they don't).
      const dailies = [dailyRow(2, "2026-04-25", { K: 7, IP: 5, ER: 2 })];
      const psp = [{ playerId: 2, ...ZERO_STATS, K: 7, IP: 5, ER: 2 }];

      // Set persistent IL events so both the PSD and PSP service calls see them —
      // avoids Promise.all ordering dependency from mockResolvedValueOnce.
      mockTransactionEventFindMany.mockResolvedValue(ilEvents);

      mockRosterFindMany.mockResolvedValueOnce(rosters);
      mockPeriodStatsCount.mockResolvedValueOnce(0);
      mockDailyFindMany.mockResolvedValueOnce(dailies);
      const psdResult = await computeTeamStatsFromDb(20, 36);
      expect(mockDailyFindMany).toHaveBeenCalledTimes(1);
      expect(mockPeriodStatsFindMany).not.toHaveBeenCalled();

      mockRosterFindMany.mockResolvedValueOnce(rosters);
      mockPeriodStatsCount.mockResolvedValueOnce(1);
      mockPeriodStatsFindMany.mockResolvedValueOnce(psp);
      const pspResult = await computeTeamStatsFromDb(20, 36);
      expect(mockPeriodStatsFindMany).toHaveBeenCalledTimes(1);
      expect(mockDailyFindMany).toHaveBeenCalledTimes(1);

      const psdRgs = psdResult.find(r => r.team.code === "AAA");
      const pspRgs = pspResult.find(r => r.team.code === "AAA");
      expect(psdRgs, "PSD: RGS not found in result").toBeDefined();
      expect(pspRgs, "PSP: RGS not found in result").toBeDefined();
      if (!psdRgs || !pspRgs) return;

      expect(psdRgs.K).toBe(0);
      expect(pspRgs.K).toBe(0);
    });
  });

  describe("mid-period pickup — PSP falls back to daily stats (paths CONVERGE)", () => {
    it("both paths split stats by ownership window when a player is acquired mid-period", async () => {
      // Player 3: held by RGS Apr 19–25 (period days 1–7), traded to DLC on
      // Apr 26 (period day 8), held by DLC through period end. Three sample
      // games: Apr 22 (RGS ownership window), May 1 and May 10 (DLC window).
      // PR #374: when hasMidPeriodPickup=true the service falls back to
      // computeWithDailyStats for both paths, so PSD and PSP now CONVERGE.
      const TRADE_AT = new Date("2026-04-26T00:00:00.000Z");
      const rosters = [
        // DESC by acquiredAt — matches the production query orderBy
        {
          teamId: 1002, playerId: 3, acquiredAt: TRADE_AT,
          releasedAt: null,
          assignedPosition: "SS",
          player: { id: 3, mlbId: 3000, posPrimary: "SS" },
        },
        {
          teamId: 1001, playerId: 3, acquiredAt: new Date("2026-03-22"),
          releasedAt: TRADE_AT,
          assignedPosition: "SS",
          player: { id: 3, mlbId: 3000, posPrimary: "SS" },
        },
      ];
      // PSD path: 1 game pre-trade (RGS window), 2 games post-trade (DLC window).
      const dailies = [
        dailyRow(3, "2026-04-22", { R: 2, HR: 1, RBI: 2, AB: 4, H: 2 }), // RGS window
        dailyRow(3, "2026-05-01", { R: 3, HR: 1, RBI: 4, AB: 4, H: 2 }), // DLC window
        dailyRow(3, "2026-05-10", { R: 1, HR: 0, RBI: 1, AB: 3, H: 1 }), // DLC window
      ];
      // PSP path: full-period totals (unused — PSP falls back to daily for mid-period pickups)
      const psp = [{ playerId: 3, ...ZERO_STATS, R: 6, HR: 2, RBI: 7, AB: 11, H: 5 }];

      const { psdResult, pspResult } = await runBothPaths(rosters, dailies, psp, { pspUsesDailyFallback: true });

      const psdRgs = psdResult.find(r => r.team.code === "AAA");
      const psdDlc = psdResult.find(r => r.team.code === "BBB");
      const pspRgs = pspResult.find(r => r.team.code === "AAA");
      const pspDlc = pspResult.find(r => r.team.code === "BBB");
      expect(psdRgs, "PSD: RGS not found").toBeDefined();
      expect(psdDlc, "PSD: DLC not found").toBeDefined();
      expect(pspRgs, "PSP: RGS not found").toBeDefined();
      expect(pspDlc, "PSP: DLC not found").toBeDefined();
      if (!psdRgs || !psdDlc || !pspRgs || !pspDlc) return;

      // PSD: RGS gets the pre-trade day (R=2, HR=1, RBI=2)
      expect(psdRgs.R).toBe(2);
      expect(psdRgs.HR).toBe(1);
      expect(psdRgs.RBI).toBe(2);
      // PSD: DLC gets the two post-trade days (R=4, HR=1, RBI=5)
      expect(psdDlc.R).toBe(4);
      expect(psdDlc.HR).toBe(1);
      expect(psdDlc.RBI).toBe(5);

      // PSP: falls back to daily stats — same split as PSD (not end-of-period owner)
      expect(pspRgs.R).toBe(2);
      expect(pspRgs.HR).toBe(1);
      expect(pspRgs.RBI).toBe(2);
      expect(pspDlc.R).toBe(4);
      expect(pspDlc.HR).toBe(1);
      expect(pspDlc.RBI).toBe(5);

      // Both paths now fully agree on per-team attribution for mid-period pickups.
      expect(psdRgs.R + psdDlc.R).toBe(pspRgs.R + pspDlc.R); // 6 = 6
      expect(psdRgs.HR + psdDlc.HR).toBe(pspRgs.HR + pspDlc.HR); // 2 = 2
      expect(psdRgs.RBI + psdDlc.RBI).toBe(pspRgs.RBI + pspDlc.RBI); // 7 = 7
    });

    it("league-wide totals invariant: PSD and PSP redistribute, but never lose or gain credit (zero-sum check)", async () => {
      // Two players, two mid-period trades — verify the league total still
      // matches between the two paths for ALL counting stats.
      const TRADE_1 = new Date("2026-04-22T00:00:00.000Z");
      const TRADE_2 = new Date("2026-05-05T00:00:00.000Z");
      const rosters = [
        { teamId: 1002, playerId: 4, acquiredAt: TRADE_1, releasedAt: null, assignedPosition: "OF", player: { id: 4, mlbId: 4000, posPrimary: "OF" } },
        { teamId: 1001, playerId: 4, acquiredAt: new Date("2026-03-22"), releasedAt: TRADE_1, assignedPosition: "OF", player: { id: 4, mlbId: 4000, posPrimary: "OF" } },
        { teamId: 1001, playerId: 5, acquiredAt: TRADE_2, releasedAt: null, assignedPosition: "P", player: { id: 5, mlbId: 5000, posPrimary: "P" } },
        { teamId: 1002, playerId: 5, acquiredAt: new Date("2026-03-22"), releasedAt: TRADE_2, assignedPosition: "P", player: { id: 5, mlbId: 5000, posPrimary: "P" } },
      ];
      const dailies = [
        dailyRow(4, "2026-04-20", { R: 1, AB: 4, H: 1 }),
        dailyRow(4, "2026-04-23", { R: 2, AB: 4, H: 2 }),
        dailyRow(4, "2026-05-01", { R: 1, AB: 3, H: 1 }),
        dailyRow(5, "2026-04-25", { K: 6, IP: 6, ER: 1 }),
        dailyRow(5, "2026-05-03", { K: 5, IP: 5, ER: 3 }),
        dailyRow(5, "2026-05-08", { K: 7, IP: 6, ER: 2 }),
      ];
      const psp = [
        { playerId: 4, ...ZERO_STATS, R: 4, AB: 11, H: 4 },
        { playerId: 5, ...ZERO_STATS, K: 18, IP: 17, ER: 6 },
      ];

      const { psdResult, pspResult } = await runBothPaths(rosters, dailies, psp, { pspUsesDailyFallback: true });

      // League total must match between paths for every counting stat.
      // TeamStatRow uses S (not SV) for saves; rate stats AVG/ERA/WHIP are excluded.
      const COUNTING_STATS = ["R", "HR", "RBI", "SB", "W", "S", "K", "H", "AB", "ER", "IP", "BB_H"] as const;
      for (const key of COUNTING_STATS) {
        const psdTotal = psdResult.reduce((s, t) => s + (Number(t[key]) || 0), 0);
        const pspTotal = pspResult.reduce((s, t) => s + (Number(t[key]) || 0), 0);
        expect(psdTotal, `zero-sum invariant failed for ${key}`).toBe(pspTotal);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Ghost-roster scenario (todo #248)
  //
  // A trade reversal can leave two overlapping roster rows for the same player:
  //   - The original active row (releasedAt: null) — the real current owner
  //   - A TRADE_IN ghost row (releasedAt set, but still > period.startDate) — the
  //     reversed trade that was NOT hard-deleted, only soft-released
  //
  // Both rows match the period overlap query:
  //   acquiredAt < endDate AND (releasedAt IS NULL OR releasedAt > startDate)
  //
  // The bug (commit b4a02bd): computeWithPeriodStats was counting the ghost team
  // as an additional "owner" even though its releasedAt < period.endDate. Fixed
  // via the `endOfPeriodOwner` dedup (ownedOn guard). This describe block pins
  // that fix so any regression is caught immediately.
  //
  // Production incident documented in:
  //   docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md
  // ---------------------------------------------------------------------------
  describe("ghost-roster (reversed trade leaves overlapping rows)", () => {
    // Scenario: Player 6 was on Alpha (1001) → traded to Bravo (1002) on Apr 24 →
    // trade reversed on Apr 25. After reversal:
    //   - Alpha row: acquiredAt=Mar 22, releasedAt=null   (active, the real owner)
    //   - Bravo ghost row: acquiredAt=Apr 24, releasedAt=Apr 25 07:45  (overlaps period, not deleted)
    // Stats: SV=2 on Apr 27 (after reversal — firmly in Alpha's window, not Bravo's).
    const TRADE_AT = new Date("2026-04-24T10:00:00.000Z");
    const REVERSAL_AT = new Date("2026-04-25T07:45:00.000Z");

    // Ordered DESC by acquiredAt to mirror the production query orderBy
    const ghostRosters = [
      // Bravo ghost: acquiredAt=Apr 24, releasedAt=Apr 25 (overlaps period but released before endDate)
      {
        teamId: 1002, playerId: 6, acquiredAt: TRADE_AT,
        releasedAt: REVERSAL_AT,
        assignedPosition: "SP",
        player: { id: 6, mlbId: 6000, posPrimary: "SP" },
      },
      // Alpha active: acquiredAt=Mar 22, releasedAt=null (real current owner)
      {
        teamId: 1001, playerId: 6, acquiredAt: new Date("2026-03-22"),
        releasedAt: null,
        assignedPosition: "SP",
        player: { id: 6, mlbId: 6000, posPrimary: "SP" },
      },
    ];

    // Stats on Apr 27 — after the reversal, well within Alpha's ownership window.
    // SV=2, K=5, IP=4 — all should land on Alpha only.
    const ghostDailies = [
      dailyRow(6, "2026-04-27", { SV: 2, K: 5, IP: 4, ER: 1, BB_H: 2 }),
    ];

    // PSP: full-period accumulation for player 6
    const ghostPsp = [
      { playerId: 6, ...ZERO_STATS, SV: 2, K: 5, IP: 4, ER: 1, BB_H: 2 },
    ];

    it("PSP path: ghost-team (Bravo) gets zero credit; active team (Alpha) gets full credit", async () => {
      // Run ONLY the PSP path (periodStatCount=1).
      mockRosterFindMany.mockResolvedValueOnce(ghostRosters);
      mockPeriodStatsCount.mockResolvedValueOnce(1);
      mockPeriodStatsFindMany.mockResolvedValueOnce(ghostPsp);
      const pspResult = await computeTeamStatsFromDb(20, 36);

      const pspAlpha = pspResult.find(r => r.team.code === "AAA");
      const pspBravo = pspResult.find(r => r.team.code === "BBB");
      expect(pspAlpha, "PSP: Alpha not found").toBeDefined();
      expect(pspBravo, "PSP: Bravo not found").toBeDefined();
      if (!pspAlpha || !pspBravo) return;

      // Alpha (active owner) gets the stats
      expect(pspAlpha.S).toBe(2);
      expect(pspAlpha.K).toBe(5);
      // Bravo (ghost) gets nothing — it did not hold the player at period.endDate
      expect(pspBravo.S).toBe(0);
      expect(pspBravo.K).toBe(0);
      // Zero-sum: league total equals the player's actual stats, not double
      expect(pspAlpha.S + pspBravo.S).toBe(2);
      expect(pspAlpha.K + pspBravo.K).toBe(5);
    });

    it("PSD path: ghost-team (Bravo) gets zero credit; active team (Alpha) gets full credit", async () => {
      // Run ONLY the PSD path (periodStatCount=0).
      mockRosterFindMany.mockResolvedValueOnce(ghostRosters);
      mockPeriodStatsCount.mockResolvedValueOnce(0);
      mockDailyFindMany.mockResolvedValueOnce(ghostDailies);
      const psdResult = await computeTeamStatsFromDb(20, 36);

      const psdAlpha = psdResult.find(r => r.team.code === "AAA");
      const psdBravo = psdResult.find(r => r.team.code === "BBB");
      expect(psdAlpha, "PSD: Alpha not found").toBeDefined();
      expect(psdBravo, "PSD: Bravo not found").toBeDefined();
      if (!psdAlpha || !psdBravo) return;

      // Alpha's ownership window covers Apr 27 (after reversal); Alpha gets the stats.
      expect(psdAlpha.S).toBe(2);
      expect(psdAlpha.K).toBe(5);
      // Bravo's ghost window ended at REVERSAL_AT (Apr 25); Apr 27 is outside it.
      expect(psdBravo.S).toBe(0);
      expect(psdBravo.K).toBe(0);
      // Zero-sum: total across both teams equals the player's stats exactly once
      expect(psdAlpha.S + psdBravo.S).toBe(2);
      expect(psdAlpha.K + psdBravo.K).toBe(5);
    });

    it("both paths agree: player stats credited exactly once, zero double-counting", async () => {
      // runBothPaths resets mocks between PSD and PSP runs.
      const { psdResult, pspResult } = await runBothPaths(ghostRosters, ghostDailies, ghostPsp);

      const COUNTING_STATS = ["R", "HR", "RBI", "SB", "W", "S", "K", "H", "AB", "ER", "IP", "BB_H"] as const;
      // TeamStatRow uses "S" for saves; PSP/daily DB data uses "SV". Map before
      // looking up the upper bound in ghostPsp (which mirrors the DB shape).
      const TEAMROW_TO_PSP: Partial<Record<string, keyof typeof ZERO_STATS>> = { S: "SV" };
      for (const key of COUNTING_STATS) {
        const psdTotal = psdResult.reduce((s, t) => s + (Number(t[key]) || 0), 0);
        const pspTotal = pspResult.reduce((s, t) => s + (Number(t[key]) || 0), 0);
        const rawKey = (TEAMROW_TO_PSP[key] ?? key) as keyof typeof ZERO_STATS;
        const rawMax = ghostPsp.reduce((s, p) => s + (p[rawKey] || 0), 0);
        // Neither path should inflate league totals beyond the raw player stats.
        expect(psdTotal, `PSD double-counted ${key}`).toBeLessThanOrEqual(rawMax);
        expect(pspTotal, `PSP double-counted ${key}`).toBeLessThanOrEqual(rawMax);
        // Both paths must agree on the league-wide total (no path-specific inflation).
        expect(psdTotal, `paths disagree on ${key}`).toBe(pspTotal);
      }
    });
  });
});
