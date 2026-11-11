/**
 * The period syncer and the reconciler must both apply the fantasy league's
 * NL/AL scoring filter, read from THAT period's league. If the syncer filtered
 * and the reconciler didn't (or vice versa), the daily reconcile would report
 * every AL-traded player as drift and "heal" him back to full-season stats.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLeagueFindUnique = vi.fn();
const mockPeriodFindUnique = vi.fn();
const mockRosterFindMany = vi.fn();
const mockPspUpsert = vi.fn();
const mockPspFindMany = vi.fn();
const mockMlbGetJson = vi.fn();

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    league: { findUnique: (...a: unknown[]) => mockLeagueFindUnique(...a) },
    period: { findUnique: (...a: unknown[]) => mockPeriodFindUnique(...a) },
    roster: { findMany: (...a: unknown[]) => mockRosterFindMany(...a) },
    playerStatsPeriod: {
      upsert: (...a: unknown[]) => mockPspUpsert(...a),
      findMany: (...a: unknown[]) => mockPspFindMany(...a),
    },
    player: { findFirst: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../../lib/mlbApi.js", () => ({ mlbGetJson: (...a: unknown[]) => mockMlbGetJson(...a) }));
vi.mock("../../../lib/statsChanged.js", () => ({ notifyStatsChanged: vi.fn() }));

import { syncPeriodStats, reconcilePeriodStats } from "../services/mlbStatsSyncService.js";

/** Liam Hicks (mlbId 689414): Miami (NL) then Tampa Bay (AL) inside one period. */
const HICKS = {
  id: 689414,
  stats: [{
    group: { displayName: "hitting" },
    splits: [
      { team: { id: 146 }, sport: { id: 1 }, stat: { gamesPlayed: 24, atBats: 83, hits: 23, runs: 9, homeRuns: 2, rbi: 11, stolenBases: 0 } },
      { team: { id: 139 }, sport: { id: 1 }, stat: { gamesPlayed: 21, atBats: 61, hits: 19, runs: 7, homeRuns: 3, rbi: 12, stolenBases: 1 } },
      { sport: { id: 0 }, stat: { gamesPlayed: 45, atBats: 144, hits: 42, runs: 16, homeRuns: 5, rbi: 23, stolenBases: 1 } },
    ],
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPeriodFindUnique.mockResolvedValue({
    id: 40, leagueId: 20,
    startDate: new Date("2026-08-02T00:00:00Z"), endDate: new Date("2026-08-29T00:00:00Z"),
  });
  mockRosterFindMany.mockResolvedValue([{ player: { id: 985, mlbId: 689414 } }]);
  mockMlbGetJson.mockResolvedValue({ people: [HICKS] });
});

describe("league-scoped stats sync", () => {
  it("an NL league's period stores only the NL line, looked up by the period's league", async () => {
    mockLeagueFindUnique.mockResolvedValue({ rules: { leagueType: "NL" } });
    await syncPeriodStats(40);
    expect(mockLeagueFindUnique).toHaveBeenCalledWith({ where: { id: 20 }, select: { rules: true } });
    const call = mockPspUpsert.mock.calls.find((c) => c[0].where.playerId_periodId.playerId === 985)!;
    expect(call[0].update).toMatchObject({ AB: 83, H: 23, HR: 2, RBI: 11, SB: 0 });
  });

  it("a league with no leagueType defaults to NL (OGBA today)", async () => {
    mockLeagueFindUnique.mockResolvedValue({ rules: null });
    await syncPeriodStats(40);
    const call = mockPspUpsert.mock.calls.find((c) => c[0].where.playerId_periodId.playerId === 985)!;
    expect(call[0].update).toMatchObject({ H: 23 });
  });

  it("a MIXED league's period stores the full aggregate", async () => {
    mockLeagueFindUnique.mockResolvedValue({ rules: { leagueType: "MIXED" } });
    await syncPeriodStats(40);
    const call = mockPspUpsert.mock.calls.find((c) => c[0].where.playerId_periodId.playerId === 985)!;
    expect(call[0].update).toMatchObject({ AB: 144, H: 42, HR: 5, RBI: 23, SB: 1 });
  });

  it("the reconciler applies the same filter: an NL-only stored row is not drift", async () => {
    mockLeagueFindUnique.mockResolvedValue({ rules: { leagueType: "NL" } });
    mockPspFindMany.mockResolvedValue([
      { playerId: 985, AB: 83, H: 23, R: 9, HR: 2, RBI: 11, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 },
    ]);
    const report = await reconcilePeriodStats(40);
    expect(report.mismatches).toEqual([]);
  });
});
