/**
 * Tests for releasedAt-boundary and free-agent attribution in computeTeamStatsFromDb.
 *
 * Design rule: computeWithPeriodStats uses cumulative period stats (no daily
 * breakdown), so stats are attributed 100% to the team that CURRENTLY holds
 * the player (releasedAt === null).  Released players — whether freed at
 * period.startDate or mid-period — get NO stats credited; free agents also
 * get nothing.  This matches FanGraphs, which computes period standings from
 * active rosters only.
 *
 * The roster query still uses `releasedAt >= period.startDate` (gte) so that
 * same-day-acquired replacements are visible for deduplication, but the
 * attribution logic skips any roster entry without an active (releasedAt=null)
 * counterpart.
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
const ZERO_STATS = { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 };

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
  mockPeriodStatsCount.mockResolvedValue(1);
});

describe("computeTeamStatsFromDb — releasedAt boundary (gte fix)", () => {
  describe("period-stats path", () => {
    it("does NOT credit stats to team that released a player AT period.startDate (free agent → no credit)", async () => {
      // Player released from RGS exactly on period.startDate with no new active holder.
      // computeWithPeriodStats attributes stats only to the current holder (releasedAt===null);
      // a free agent gets no credit from any team.
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 145, playerId: 10, acquiredAt: new Date("2026-03-22"),
          releasedAt: PERIOD_START,
          assignedPosition: "C",
          player: { id: 10, mlbId: 1000, posPrimary: "C" },
        },
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 10, ...ZERO_STATS, R: 2, HR: 1, RBI: 3 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      const rgs = result.find(r => r.team.code === "RGS")!;
      expect(rgs.R).toBe(0);
      expect(rgs.HR).toBe(0);
    });

    it("does NOT credit stats when player was released BEFORE period.startDate", async () => {
      // Released one day before the period — should not appear in roster query at all.
      const dayBefore = new Date("2026-04-18T00:00:00.000Z");
      mockRosterFindMany.mockResolvedValue([]);  // roster query returns empty (releasedAt < startDate)
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 10, ...ZERO_STATS, R: 5 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      const rgs = result.find(r => r.team.code === "RGS")!;
      expect(rgs.R).toBe(0); // no roster entry → no credit
    });

    it("credits stats to new team when player moved mid-period (releasedAt > startDate)", async () => {
      // Player traded mid-period: released from RGS on Apr 25, acquired by DLC on Apr 25.
      // computeWithPeriodStats attributes full-period stats to the player's current team (DLC).
      const tradedAt = new Date("2026-04-25T00:00:00.000Z");
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 145, playerId: 20, acquiredAt: new Date("2026-03-22"),
          releasedAt: tradedAt,
          assignedPosition: "SS",
          player: { id: 20, mlbId: 2000, posPrimary: "SS" },
        },
        {
          teamId: 148, playerId: 20, acquiredAt: tradedAt,
          releasedAt: null,
          assignedPosition: "SS",
          player: { id: 20, mlbId: 2000, posPrimary: "SS" },
        },
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 20, ...ZERO_STATS, R: 10, HR: 3 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      const rgs = result.find(r => r.team.code === "RGS")!;
      const dlc = result.find(r => r.team.code === "DLC")!;
      // Stats go to current owner (DLC); RGS gets nothing for traded player
      expect(dlc.R).toBe(10);
      expect(rgs.R).toBe(0);
    });

    it("does not double-count stats when both releasing and acquiring team entries exist at period start", async () => {
      // Edge: two roster rows for same player (released from one team exactly at startDate,
      // acquired by another team exactly at startDate via same-day transaction).
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 145, playerId: 30, acquiredAt: new Date("2026-03-22"),
          releasedAt: PERIOD_START, // released at period start (now included via gte)
          assignedPosition: "OF",
          player: { id: 30, mlbId: 3000, posPrimary: "OF" },
        },
        {
          teamId: 148, playerId: 30, acquiredAt: PERIOD_START,
          releasedAt: null, // currently active on DLC
          assignedPosition: "OF",
          player: { id: 30, mlbId: 3000, posPrimary: "OF" },
        },
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 30, ...ZERO_STATS, R: 8, HR: 2 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      const rgs = result.find(r => r.team.code === "RGS")!;
      const dlc = result.find(r => r.team.code === "DLC")!;
      const totalR = rgs.R + dlc.R;
      // Stats must count exactly once, not doubled
      expect(totalR).toBe(8);
      // Active team (DLC) takes priority
      expect(dlc.R).toBe(8);
      expect(rgs.R).toBe(0);
    });

    it("does NOT credit pitching stats (W, K, SV) to team that released a pitcher as free agent", async () => {
      // Regression target: the production bug surfaced as W=15 (should ~12) and K=194 (should ~152)
      // because dropped pitchers' full-period totals were bleeding into the releasing team.
      // This test pins the fix for pitching categories specifically.
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 145, playerId: 40, acquiredAt: new Date("2026-03-22"),
          releasedAt: new Date("2026-04-19T00:00:00.000Z"), // released = period start; free agent
          assignedPosition: "P",
          player: { id: 40, mlbId: 4000, posPrimary: "P" },
        },
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 40, ...ZERO_STATS, W: 3, K: 42, SV: 2 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      const rgs = result.find(r => r.team.code === "RGS")!;
      expect(rgs.W).toBe(0);
      expect(rgs.K).toBe(0);
      expect(rgs.S).toBe(0);
    });

    it("does NOT credit stats from any of multiple simultaneous free agents", async () => {
      // Production incident: Los Doyers had 6 dropped players all as free agents.
      // Each one must contribute 0 to every team — not just the last team that held them.
      mockRosterFindMany.mockResolvedValue([
        // Three pitchers dropped by RGS, all free agents (releasedAt=period start, no new owner)
        {
          teamId: 145, playerId: 50, acquiredAt: new Date("2026-03-22"),
          releasedAt: PERIOD_START,
          assignedPosition: "P",
          player: { id: 50, mlbId: 5000, posPrimary: "P" },
        },
        {
          teamId: 145, playerId: 51, acquiredAt: new Date("2026-03-22"),
          releasedAt: PERIOD_START,
          assignedPosition: "P",
          player: { id: 51, mlbId: 5001, posPrimary: "P" },
        },
        {
          teamId: 145, playerId: 52, acquiredAt: new Date("2026-03-22"),
          releasedAt: PERIOD_START,
          assignedPosition: "P",
          player: { id: 52, mlbId: 5002, posPrimary: "P" },
        },
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 50, ...ZERO_STATS, W: 2, K: 30 },
        { playerId: 51, ...ZERO_STATS, W: 1, K: 15 },
        { playerId: 52, ...ZERO_STATS, W: 2, K: 22, SV: 3 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      const rgs = result.find(r => r.team.code === "RGS")!;
      const dlc = result.find(r => r.team.code === "DLC")!;
      // No free-agent stats should appear anywhere
      expect(rgs.W).toBe(0);
      expect(rgs.K).toBe(0);
      expect(dlc.W).toBe(0);
      expect(dlc.K).toBe(0);
    });

    it("credits stats exactly once when player is released and re-acquired by same team in same period", async () => {
      const dropDate = new Date("2026-04-25T00:00:00.000Z");
      const readdDate = new Date("2026-04-28T00:00:00.000Z");

      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 145, playerId: 60, acquiredAt: new Date("2026-03-22"),
          releasedAt: dropDate,
          assignedPosition: "SS",
          player: { id: 60, mlbId: 6000, posPrimary: "SS" },
        },
        {
          teamId: 145, playerId: 60, acquiredAt: readdDate,
          releasedAt: null,
          assignedPosition: "SS",
          player: { id: 60, mlbId: 6000, posPrimary: "SS" },
        },
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 60, ...ZERO_STATS, R: 7, HR: 2 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      const rgs = result.find(r => r.team.code === "RGS")!;
      // Stats credited exactly once (active entry wins, no double-count)
      expect(rgs.R).toBe(7);
      expect(rgs.HR).toBe(2);
      // Total across both teams must still be 7 (no duplication)
      const dlc = result.find(r => r.team.code === "DLC")!;
      expect(rgs.R + dlc.R).toBe(7);
    });

    it("credits full period stats to new team for mid-period trade (period-stats path)", async () => {
      // Period-stats path: all period stats go to current owner (releasedAt=null),
      // regardless of when in the period the trade occurred.
      const tradedAt = new Date("2026-04-25T00:00:00.000Z");
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 145, playerId: 70, acquiredAt: new Date("2026-03-22"),
          releasedAt: tradedAt,
          assignedPosition: "OF",
          player: { id: 70, mlbId: 7000, posPrimary: "OF" },
        },
        {
          teamId: 148, playerId: 70, acquiredAt: tradedAt,
          releasedAt: null,
          assignedPosition: "OF",
          player: { id: 70, mlbId: 7000, posPrimary: "OF" },
        },
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 70, ...ZERO_STATS, R: 15, HR: 4, RBI: 12 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      const rgs = result.find(r => r.team.code === "RGS")!;
      const dlc = result.find(r => r.team.code === "DLC")!;
      // New owner (DLC) gets ALL period stats; original team (RGS) gets nothing
      expect(dlc.R).toBe(15);
      expect(dlc.HR).toBe(4);
      expect(rgs.R).toBe(0);
      expect(rgs.HR).toBe(0);
    });
  });
});
