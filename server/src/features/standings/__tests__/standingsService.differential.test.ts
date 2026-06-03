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
 *  paths on the same scenario").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPeriodFindUnique = vi.fn();
const mockTeamFindMany = vi.fn();
const mockRosterFindMany = vi.fn();
const mockDailyFindMany = vi.fn();
const mockDailyGroupBy = vi.fn();
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
      groupBy: (...a: unknown[]) => mockDailyGroupBy(...a),
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
const PERIOD_END = new Date("2026-05-16T23:59:59.999Z");
const ZERO_DAILY = { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 };
const ZERO_PERIOD = { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 };

function dailyRow(playerId: number, date: string, stats: Partial<typeof ZERO_DAILY>) {
  return { playerId, gameDate: new Date(date), ...ZERO_DAILY, ...stats };
}

beforeEach(() => {
  mockPeriodFindUnique.mockReset();
  mockTeamFindMany.mockReset();
  mockRosterFindMany.mockReset();
  mockDailyFindMany.mockReset();
  mockDailyGroupBy.mockReset();
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
      const psp = [{ playerId: 1, ...ZERO_PERIOD, R: 12, HR: 4, RBI: 8, AB: 12, H: 7 }];

      // Run PSD path (no PSP rows). Only queue mocks the path actually calls.
      mockRosterFindMany.mockResolvedValueOnce(rosters);
      mockPeriodStatsCount.mockResolvedValueOnce(0);
      mockDailyFindMany.mockResolvedValueOnce(dailies);
      const psdResult = await computeTeamStatsFromDb(20, 36);

      // Run PSP path (PSP rows exist). Only queue mocks the path actually calls.
      mockRosterFindMany.mockResolvedValueOnce(rosters);
      mockPeriodStatsCount.mockResolvedValueOnce(1);
      mockPeriodStatsFindMany.mockResolvedValueOnce(psp);
      const pspResult = await computeTeamStatsFromDb(20, 36);

      const psdRgs = psdResult.find(r => r.team.code === "RGS")!;
      const pspRgs = pspResult.find(r => r.team.code === "RGS")!;

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
      const psp = [{ playerId: 2, ...ZERO_PERIOD, K: 7, IP: 5, ER: 2 }];

      mockRosterFindMany.mockResolvedValueOnce(rosters);
      mockTransactionEventFindMany.mockResolvedValueOnce(ilEvents);
      mockPeriodStatsCount.mockResolvedValueOnce(0);
      mockDailyFindMany.mockResolvedValueOnce(dailies);
      const psdResult = await computeTeamStatsFromDb(20, 36);

      mockRosterFindMany.mockResolvedValueOnce(rosters);
      mockTransactionEventFindMany.mockResolvedValueOnce(ilEvents);
      mockPeriodStatsCount.mockResolvedValueOnce(1);
      mockPeriodStatsFindMany.mockResolvedValueOnce(psp);
      const pspResult = await computeTeamStatsFromDb(20, 36);

      const psdRgs = psdResult.find(r => r.team.code === "RGS")!;
      const pspRgs = pspResult.find(r => r.team.code === "RGS")!;
      expect(psdRgs.K).toBe(0);
      expect(pspRgs.K).toBe(0);
    });
  });

  describe("mid-period trade (paths INTENTIONALLY diverge)", () => {
    it("PSD splits per-day; PSP credits the end-of-period owner for the full PSP row", async () => {
      // Player 3: RGS days 1-7, traded to DLC on Apr 26 (day 8 of P2),
      // held by DLC through period end. The PSD path splits stats by
      // ownership window; the PSP path credits DLC (end-of-period owner)
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
      // PSD path: 1 game pre-trade, 2 games post-trade.
      const dailies = [
        dailyRow(3, "2026-04-22", { R: 2, HR: 1, RBI: 2, AB: 4, H: 2 }), // RGS window
        dailyRow(3, "2026-05-01", { R: 3, HR: 1, RBI: 4, AB: 4, H: 2 }), // DLC window
        dailyRow(3, "2026-05-10", { R: 1, HR: 0, RBI: 1, AB: 3, H: 1 }), // DLC window
      ];
      // PSP path: same totals aggregated for the full period (no split).
      const psp = [{ playerId: 3, ...ZERO_PERIOD, R: 6, HR: 2, RBI: 7, AB: 11, H: 5 }];

      // PSD path
      mockRosterFindMany.mockResolvedValueOnce(rosters);
      mockPeriodStatsCount.mockResolvedValueOnce(0);
      mockDailyFindMany.mockResolvedValueOnce(dailies);
      const psdResult = await computeTeamStatsFromDb(20, 36);

      // PSP path
      mockRosterFindMany.mockResolvedValueOnce(rosters);
      mockPeriodStatsCount.mockResolvedValueOnce(1);
      mockPeriodStatsFindMany.mockResolvedValueOnce(psp);
      const pspResult = await computeTeamStatsFromDb(20, 36);

      const psdRgs = psdResult.find(r => r.team.code === "RGS")!;
      const psdDlc = psdResult.find(r => r.team.code === "DLC")!;
      const pspRgs = pspResult.find(r => r.team.code === "RGS")!;
      const pspDlc = pspResult.find(r => r.team.code === "DLC")!;

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
      // matches between the two paths for every counting stat. This is the
      // weakest possible safety net but it's also the cheapest to maintain.
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
        { playerId: 4, ...ZERO_PERIOD, R: 4, AB: 11, H: 4 },
        { playerId: 5, ...ZERO_PERIOD, K: 18, IP: 17, ER: 6 },
      ];

      mockRosterFindMany.mockResolvedValueOnce(rosters);
      mockPeriodStatsCount.mockResolvedValueOnce(0);
      mockDailyFindMany.mockResolvedValueOnce(dailies);
      const psdResult = await computeTeamStatsFromDb(20, 36);

      mockRosterFindMany.mockResolvedValueOnce(rosters);
      mockPeriodStatsCount.mockResolvedValueOnce(1);
      mockPeriodStatsFindMany.mockResolvedValueOnce(psp);
      const pspResult = await computeTeamStatsFromDb(20, 36);

      const psdR = psdResult.reduce((s, t) => s + t.R, 0);
      const pspR = pspResult.reduce((s, t) => s + t.R, 0);
      const psdK = psdResult.reduce((s, t) => s + t.K, 0);
      const pspK = pspResult.reduce((s, t) => s + t.K, 0);

      // League total must match between paths for every counting stat.
      expect(psdR).toBe(pspR); // 4 R distributed identically in total
      expect(psdK).toBe(pspK); // 18 K distributed identically in total
    });
  });
});
