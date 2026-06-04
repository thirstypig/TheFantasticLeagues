/**
 * Tests for releasedAt-boundary and trade attribution in computeTeamStatsFromDb.
 *
 * Design rule (post-#242): computeWithPeriodStats attributes each period's PSP
 * to the team that owned the player on `period.endDate`. A player is "owned
 * on endDate" iff there is a roster row with `acquiredAt <= endDate` AND
 * (`releasedAt IS NULL` OR `releasedAt > endDate`). The releasing team keeps
 * credit only when the trade happened STRICTLY AFTER the period closed.
 *
 * This matches FanGraphs/OnRoto semantics — what owners see on FG is the
 * source-of-truth view for the league, and FBST production needs to agree.
 *
 * Prior to #242 the attribution was "current owner" (`releasedAt === null`),
 * which retroactively reassigned closed-period credit when a player was
 * traded after the period ended — a silent bug that diverged FBST from FG.
 *
 * Add-back ordering: the rosters query in standingsService now uses
 * `orderBy: { acquiredAt: "desc" }` so the "first row wins" idiom in the
 * end-of-period owner builder always picks the LATEST acquisition. The
 * add-back-during-period test below pins this contract.
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
// noon UTC — matches periods/routes.ts storage convention (new Date(date + "T12:00:00Z"))
const PERIOD_END = new Date("2026-05-16T12:00:00.000Z");
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

describe("computeTeamStatsFromDb — releasedAt boundary + attribution", () => {
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

    it("credits CLOSED-period stats to END-of-period owner, not current owner (todo #242)", async () => {
      // Regression test: Bryson Stott / Skunk Dogs P1 scenario from 2026-06-02 audit.
      // Player held by RGS for ALL of Period 1 (3/25 - 4/18); released the day after
      // P1 closes (4/19) and acquired by DLC on 4/19. The OLD `computeWithPeriodStats`
      // attributed P1's PSP to the CURRENT owner (DLC), retroactively reassigning
      // closed-period credit. With the end-of-period-owner fix, RGS keeps P1 credit
      // because they still held the player on 4/18.
      //
      // Without this fix, owners see their standings shift after every post-period
      // trade — a silent bug that diverges FBST from FanGraphs/OnRoto.
      // noon UTC — matches periods/routes.ts storage convention
      const P1_END = new Date("2026-04-18T12:00:00.000Z");
      const dayAfterP1 = new Date("2026-04-19T00:00:00.000Z");
      mockPeriodFindUnique.mockResolvedValue({
        id: 35,
        startDate: new Date("2026-03-25T00:00:00.000Z"),
        endDate: P1_END,
      });
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 145, playerId: 50, acquiredAt: new Date("2026-03-22"),
          releasedAt: dayAfterP1, // released the day after P1 closes
          assignedPosition: "2B",
          player: { id: 50, mlbId: 5000, posPrimary: "2B" },
        },
        {
          teamId: 148, playerId: 50, acquiredAt: dayAfterP1, // picked up the day after P1 closes
          releasedAt: null,
          assignedPosition: "2B",
          player: { id: 50, mlbId: 5000, posPrimary: "2B" },
        },
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 50, ...ZERO_STATS, R: 12, HR: 4, RBI: 9 },
      ]);

      const result = await computeTeamStatsFromDb(20, 35);
      const rgs = result.find(r => r.team.code === "RGS")!;
      const dlc = result.find(r => r.team.code === "DLC")!;
      // End-of-period (4/18) owner is RGS — they get P1 credit.
      expect(rgs.R).toBe(12);
      expect(rgs.HR).toBe(4);
      expect(rgs.RBI).toBe(9);
      // DLC acquired the player AFTER P1 ended; gets 0 P1 credit.
      expect(dlc.R).toBe(0);
      expect(dlc.HR).toBe(0);
      expect(dlc.RBI).toBe(0);
    });

    it("credits stats to new team when player moved mid-period (releasedAt > startDate)", async () => {
      // Player traded mid-period: released from RGS on Apr 25, acquired by DLC on Apr 25.
      // End-of-period owner is DLC (still holds through PERIOD_END 5/16), so DLC
      // gets the full-period PSP. RGS's row was released before endDate → no credit.
      const tradedAt = new Date("2026-04-25T00:00:00.000Z");
      // Per the orderBy: { acquiredAt: "desc" } contract on the rosters query,
      // the DLC row (acquiredAt 4/25) comes before the RGS row (acquiredAt 3/22)
      // in the iteration order. First-wins idiom in endOfPeriodOwner picks DLC.
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 148, playerId: 20, acquiredAt: tradedAt,
          releasedAt: null,
          assignedPosition: "SS",
          player: { id: 20, mlbId: 2000, posPrimary: "SS" },
        },
        {
          teamId: 145, playerId: 20, acquiredAt: new Date("2026-03-22"),
          releasedAt: tradedAt,
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
      // End-of-period owner (DLC) gets credit; RGS released player mid-period.
      expect(dlc.R).toBe(10);
      expect(rgs.R).toBe(0);
    });

    it("picks LATEST acquisition on drop-and-re-add within a period (orderBy contract)", async () => {
      // Regression for code-review finding on PR #365: comment claimed
      // "latest acquiredAt wins" but the build loop is "first row wins."
      // The fix added `orderBy: { acquiredAt: "desc" }` to the rosters query
      // so the first row encountered IS the latest acquisition.
      //
      // Scenario: RGS held player day 1, dropped them on day 5, re-acquired
      // them on day 20. Both roster rows pass the end-of-period predicate
      // (both have releasedAt > endDate or null), so without correct ordering
      // an earlier row could win.
      mockRosterFindMany.mockResolvedValue([
        // DESC by acquiredAt → re-acquisition row appears first
        {
          teamId: 145, playerId: 60, acquiredAt: new Date("2026-05-08T00:00:00.000Z"),
          releasedAt: null,
          assignedPosition: "OF",
          player: { id: 60, mlbId: 6000, posPrimary: "OF" },
        },
        // Earlier ownership stint (released day 5 of period)
        {
          teamId: 145, playerId: 60, acquiredAt: new Date("2026-03-22T00:00:00.000Z"),
          releasedAt: new Date("2026-04-23T00:00:00.000Z"),
          assignedPosition: "OF",
          player: { id: 60, mlbId: 6000, posPrimary: "OF" },
        },
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 60, ...ZERO_STATS, R: 15, HR: 4, RBI: 11 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      const rgs = result.find(r => r.team.code === "RGS")!;
      // RGS is end-of-period owner via the LATE re-acquisition row.
      // Stats counted exactly once.
      expect(rgs.R).toBe(15);
      expect(rgs.HR).toBe(4);
      expect(rgs.RBI).toBe(11);
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

    it("credits stats exactly once when player is released and re-acquired by same team — active entry returned first (normal order)", async () => {
      // Normal case: Prisma returns the active (releasedAt=null) entry before the released entry.
      // Stats should be credited exactly once to the team that currently holds the player.
      const dropDate = new Date("2026-04-25T00:00:00.000Z");
      const readdDate = new Date("2026-04-28T00:00:00.000Z");

      mockRosterFindMany.mockResolvedValue([
        // Active entry FIRST — the "normal" Prisma ordering
        {
          teamId: 145, playerId: 60, acquiredAt: readdDate,
          releasedAt: null,
          assignedPosition: "SS",
          player: { id: 60, mlbId: 6000, posPrimary: "SS" },
        },
        {
          teamId: 145, playerId: 60, acquiredAt: new Date("2026-03-22"),
          releasedAt: dropDate,
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

    it("credits stats exactly once when player is released and re-acquired by same team — released entry returned FIRST (ordering bug scenario)", async () => {
      // Bug scenario: Prisma returns the released entry before the active one.
      // Without the fix (#195), countedPlayers.add would fire on the released entry,
      // claiming the dedup slot before the currentTeam guard could skip it —
      // the active entry would then be blocked by countedPlayers.has(), causing
      // the player to be skipped entirely (R=0 instead of R=7).
      // With the fix, countedPlayers.add fires AFTER all guards, so the released
      // entry is skipped by the currentTeam !== t.id guard first; the active entry
      // then passes all guards and gets counted correctly.
      const dropDate = new Date("2026-04-25T00:00:00.000Z");
      const readdDate = new Date("2026-04-28T00:00:00.000Z");

      mockRosterFindMany.mockResolvedValue([
        // Released entry FIRST — triggers the bug if countedPlayers.add fires too early
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
