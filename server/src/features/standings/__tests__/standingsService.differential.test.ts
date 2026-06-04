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
  mockTeamFindMany.mockResolvedValue([
    { id: 145, name: "RGing Sluggers", code: "RGS" },
    { id: 148, name: "Demolition Lumber Co.", code: "DLC" },
  ]);
});

describe("computeTeamStatsFromDb — PSD ↔ PSP differential", () => {
  describe("static ownership (no in-period trade)", () => {
    it("PSD and PSP agree on per-team totals when a player is held by one team for the whole period", async () => {
      // Player 1 on RGS for the entire period. Both paths should produce the
      // same per-team totals.
      const rosters = [
        {
          teamId: 145, playerId: 1, acquiredAt: new Date("2026-03-22"),
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

      // Run PSD path (no PSP rows).
      mockRosterFindMany.mockResolvedValueOnce(rosters);
      mockPeriodStatsCount.mockResolvedValueOnce(0);
      mockDailyFindMany.mockResolvedValueOnce(dailies);
      const psdResult = await computeTeamStatsFromDb(20, 36);
      // Path guard: confirm PSD branch was taken, not PSP.
      expect(mockDailyFindMany).toHaveBeenCalledTimes(1);
      expect(mockPeriodStatsFindMany).not.toHaveBeenCalled();

      // Run PSP path (PSP rows exist).
      mockRosterFindMany.mockResolvedValueOnce(rosters);
      mockPeriodStatsCount.mockResolvedValueOnce(1);
      mockPeriodStatsFindMany.mockResolvedValueOnce(psp);
      const pspResult = await computeTeamStatsFromDb(20, 36);
      // Path guard: confirm PSP branch was taken; PSD was not called again.
      expect(mockPeriodStatsFindMany).toHaveBeenCalledTimes(1);
      expect(mockDailyFindMany).toHaveBeenCalledTimes(1);

      const psdRgs = psdResult.find(r => r.team.code === "RGS");
      const pspRgs = pspResult.find(r => r.team.code === "RGS");
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
          teamId: 145, playerId: 2, acquiredAt: new Date("2026-03-22"),
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

      const psdRgs = psdResult.find(r => r.team.code === "RGS");
      const pspRgs = pspResult.find(r => r.team.code === "RGS");
      expect(psdRgs, "PSD: RGS not found in result").toBeDefined();
      expect(pspRgs, "PSP: RGS not found in result").toBeDefined();
      if (!psdRgs || !pspRgs) return;

      expect(psdRgs.K).toBe(0);
      expect(pspRgs.K).toBe(0);
    });
  });

  describe("mid-period trade (paths INTENTIONALLY diverge)", () => {
    it("PSD splits per-day; PSP credits the end-of-period owner for the full PSP row", async () => {
      // Player 3: held by RGS Apr 19–25 (period days 1–7), traded to DLC on
      // Apr 26 (period day 8), held by DLC through period end. Three sample
      // games: Apr 22 (RGS ownership window), May 1 and May 10 (DLC window).
      // PSD splits credit by window; PSP credits DLC (end-of-period owner)
      // with the full-period PSP row.
      const TRADE_AT = new Date("2026-04-26T00:00:00.000Z");
      const rosters = [
        // DESC by acquiredAt — matches the production query orderBy
        {
          teamId: 148, playerId: 3, acquiredAt: TRADE_AT,
          releasedAt: null,
          assignedPosition: "SS",
          player: { id: 3, mlbId: 3000, posPrimary: "SS" },
        },
        {
          teamId: 145, playerId: 3, acquiredAt: new Date("2026-03-22"),
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
      // PSP path: same totals aggregated for the full period (no split).
      const psp = [{ playerId: 3, ...ZERO_STATS, R: 6, HR: 2, RBI: 7, AB: 11, H: 5 }];

      // PSD path
      mockRosterFindMany.mockResolvedValueOnce(rosters);
      mockPeriodStatsCount.mockResolvedValueOnce(0);
      mockDailyFindMany.mockResolvedValueOnce(dailies);
      const psdResult = await computeTeamStatsFromDb(20, 36);
      expect(mockDailyFindMany).toHaveBeenCalledTimes(1);
      expect(mockPeriodStatsFindMany).not.toHaveBeenCalled();

      // PSP path
      mockRosterFindMany.mockResolvedValueOnce(rosters);
      mockPeriodStatsCount.mockResolvedValueOnce(1);
      mockPeriodStatsFindMany.mockResolvedValueOnce(psp);
      const pspResult = await computeTeamStatsFromDb(20, 36);
      expect(mockPeriodStatsFindMany).toHaveBeenCalledTimes(1);
      expect(mockDailyFindMany).toHaveBeenCalledTimes(1);

      const psdRgs = psdResult.find(r => r.team.code === "RGS");
      const psdDlc = psdResult.find(r => r.team.code === "DLC");
      const pspRgs = pspResult.find(r => r.team.code === "RGS");
      const pspDlc = pspResult.find(r => r.team.code === "DLC");
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

      // PSP: DLC (end-of-period owner) gets the full PSP row
      expect(pspDlc.R).toBe(6);
      expect(pspDlc.HR).toBe(2);
      expect(pspDlc.RBI).toBe(7);
      // PSP: RGS released the player before endDate; gets nothing
      expect(pspRgs.R).toBe(0);
      expect(pspRgs.HR).toBe(0);
      expect(pspRgs.RBI).toBe(0);

      // Convergence-of-totals invariant: across both teams, both paths
      // credit the same league-wide totals. Documented divergence is in
      // per-team attribution, not in league totals.
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
        { teamId: 148, playerId: 4, acquiredAt: TRADE_1, releasedAt: null, assignedPosition: "OF", player: { id: 4, mlbId: 4000, posPrimary: "OF" } },
        { teamId: 145, playerId: 4, acquiredAt: new Date("2026-03-22"), releasedAt: TRADE_1, assignedPosition: "OF", player: { id: 4, mlbId: 4000, posPrimary: "OF" } },
        { teamId: 145, playerId: 5, acquiredAt: TRADE_2, releasedAt: null, assignedPosition: "P", player: { id: 5, mlbId: 5000, posPrimary: "P" } },
        { teamId: 148, playerId: 5, acquiredAt: new Date("2026-03-22"), releasedAt: TRADE_2, assignedPosition: "P", player: { id: 5, mlbId: 5000, posPrimary: "P" } },
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
});
