/**
 * Stats integrity reconciliation tests (ADR-014, todo #287).
 *
 * The reconciler re-fetches a period through the SAME fetch/parse path the
 * syncer uses and diffs against stored PlayerStatsPeriod rows. These tests pin:
 *  - clean periods report zero mismatches
 *  - drift is reported field-by-field (the P1 April-19 inflation shape)
 *  - missing stored rows with real fresh stats are drift
 *  - the two-way mirror transform never false-alarms on pre-split Ohtani rows
 *  - the sweep auto-heals via re-sync, and alerts on persistent drift
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPeriodFindUnique = vi.fn();
const mockPeriodFindMany = vi.fn();
const mockRosterFindMany = vi.fn();
const mockPspFindMany = vi.fn();
const mockMlbGetJson = vi.fn();
const mockErrorPush = vi.fn();

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    period: {
      findUnique: (...a: unknown[]) => mockPeriodFindUnique(...a),
      findMany: (...a: unknown[]) => mockPeriodFindMany(...a),
    },
    roster: { findMany: (...a: unknown[]) => mockRosterFindMany(...a) },
    playerStatsPeriod: {
      findMany: (...a: unknown[]) => mockPspFindMany(...a),
      upsert: vi.fn(),
      count: vi.fn(),
    },
    player: { findFirst: vi.fn() },
  },
}));

vi.mock("../../../lib/mlbApi.js", () => ({
  mlbGetJson: (...a: unknown[]) => mockMlbGetJson(...a),
}));

vi.mock("../../../lib/errorBuffer.js", () => ({
  push: (...a: unknown[]) => mockErrorPush(...a),
}));

import { reconcilePeriodStats, reconcileRecentlyClosedPeriods } from "../services/mlbStatsSyncService.js";

const PERIOD = {
  id: 35,
  startDate: new Date("2026-03-25T00:00:00.000Z"),
  endDate: new Date("2026-04-18T00:00:00.000Z"),
};

const ZERO_PSP = {
  AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0,
  W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0,
};

function person(id: number, opts: { hitting?: Record<string, number | string>; pitching?: Record<string, number | string> } = {}) {
  const stats: unknown[] = [];
  if (opts.hitting) stats.push({ group: { displayName: "hitting" }, splits: [{ stat: opts.hitting }] });
  if (opts.pitching) stats.push({ group: { displayName: "pitching" }, splits: [{ stat: opts.pitching }] });
  return { id, stats };
}

beforeEach(() => {
  mockPeriodFindUnique.mockReset();
  mockPeriodFindMany.mockReset();
  mockRosterFindMany.mockReset();
  mockPspFindMany.mockReset();
  mockMlbGetJson.mockReset();
  mockErrorPush.mockReset();
  mockPeriodFindUnique.mockResolvedValue(PERIOD);
});

describe("reconcilePeriodStats", () => {
  it("reports zero mismatches when stored rows equal the fresh fetch", async () => {
    mockRosterFindMany.mockResolvedValue([
      { player: { id: 11, mlbId: 1000 } },
    ]);
    mockMlbGetJson.mockResolvedValue({
      people: [person(1000, { hitting: { atBats: 40, hits: 12, runs: 10, homeRuns: 2, rbi: 8, stolenBases: 1 } })],
    });
    mockPspFindMany.mockResolvedValue([
      { playerId: 11, ...ZERO_PSP, AB: 40, H: 12, R: 10, HR: 2, RBI: 8, SB: 1 },
    ]);

    const report = await reconcilePeriodStats(35);

    expect(report.mismatches).toEqual([]);
    expect(report.playersChecked).toBe(1);
    expect(report.fetchErrors).toBe(0);
  });

  it("reports field-level drift when stored rows exceed the official record (April-19 inflation shape)", async () => {
    mockRosterFindMany.mockResolvedValue([{ player: { id: 11, mlbId: 1000 } }]);
    // Official record today: 24 K. Stored: 31 K (frozen with an extra day baked in).
    mockMlbGetJson.mockResolvedValue({
      people: [person(1000, { pitching: { strikeOuts: 24, wins: 2, inningsPitched: "24.0", earnedRuns: 8, baseOnBalls: 6, hits: 18 } })],
    });
    mockPspFindMany.mockResolvedValue([
      { playerId: 11, ...ZERO_PSP, K: 31, W: 2, IP: 24, ER: 8, BB_H: 24 },
    ]);

    const report = await reconcilePeriodStats(35);

    const kDrift = report.mismatches.find((m) => m.field === "K");
    expect(kDrift).toMatchObject({ playerId: 11, stored: 31, fresh: 24 });
    expect(report.mismatches.find((m) => m.field === "W")).toBeUndefined();
  });

  it("flags a missing stored row when the official record has stats for a rostered player", async () => {
    mockRosterFindMany.mockResolvedValue([{ player: { id: 11, mlbId: 1000 } }]);
    mockMlbGetJson.mockResolvedValue({
      people: [person(1000, { hitting: { runs: 5, atBats: 20, hits: 6 } })],
    });
    mockPspFindMany.mockResolvedValue([]); // no stored row at all

    const report = await reconcilePeriodStats(35);

    expect(report.mismatches.find((m) => m.field === "R")).toMatchObject({ stored: 0, fresh: 5 });
  });

  it("applies the two-way mirror transform — pre-split Ohtani rows never false-alarm", async () => {
    // Roster has both the real row (660271 → player 3) and the synthetic pitcher
    // row (1660271 → player 3191). Stored rows are pre-split by the sync mirror:
    // real = hitting only, synthetic = pitching only.
    mockRosterFindMany.mockResolvedValue([
      { player: { id: 3, mlbId: 660271 } },
      { player: { id: 3191, mlbId: 1660271 } },
    ]);
    mockMlbGetJson.mockResolvedValue({
      people: [person(660271, {
        hitting: { runs: 13, homeRuns: 5, atBats: 80, hits: 22, rbi: 11, stolenBases: 2 },
        pitching: { strikeOuts: 18, wins: 2, inningsPitched: "18.0", earnedRuns: 5, baseOnBalls: 7, hits: 12 },
      })],
    });
    mockPspFindMany.mockResolvedValue([
      { playerId: 3, ...ZERO_PSP, R: 13, HR: 5, AB: 80, H: 22, RBI: 11, SB: 2 }, // pitching zeroed
      { playerId: 3191, ...ZERO_PSP, K: 18, W: 2, IP: 18, ER: 5, BB_H: 19 },     // hitting zeroed
    ]);

    const report = await reconcilePeriodStats(35);

    expect(report.mismatches).toEqual([]);
    expect(report.playersChecked).toBe(2);
  });
});

describe("reconcileRecentlyClosedPeriods", () => {
  function arrangeSweepPeriod(storedSequence: Array<Record<string, number>>) {
    mockPeriodFindMany.mockResolvedValue([{ id: 35, name: "Period 1" }]);
    mockRosterFindMany.mockResolvedValue([{ player: { id: 11, mlbId: 1000 } }]);
    mockMlbGetJson.mockResolvedValue({
      people: [person(1000, { hitting: { runs: 10, atBats: 40, hits: 12 } })],
    });
    // Each reconcile pass reads stored rows once
    for (const stored of storedSequence) {
      mockPspFindMany.mockResolvedValueOnce([{ playerId: 11, ...ZERO_PSP, ...stored }]);
    }
  }

  it("selects only recently completed periods (status + endDate window)", async () => {
    mockPeriodFindMany.mockResolvedValue([]);
    await reconcileRecentlyClosedPeriods({ windowDays: 5 });
    const where = mockPeriodFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("completed");
    expect(where.endDate.gte).toBeInstanceOf(Date);
    expect(where.endDate.lte).toBeInstanceOf(Date);
  });

  it("reports clean periods without re-syncing", async () => {
    arrangeSweepPeriod([{ R: 10, AB: 40, H: 12 }]);
    const resync = vi.fn();

    const entries = await reconcileRecentlyClosedPeriods({ resync });

    expect(entries).toEqual([{ periodId: 35, periodName: "Period 1", status: "clean", mismatchesBefore: 0, mismatchesAfter: 0 }]);
    expect(resync).not.toHaveBeenCalled();
    expect(mockErrorPush).not.toHaveBeenCalled();
  });

  it("auto-heals drift: re-syncs, verifies clean, reports healed", async () => {
    // First pass: stored R=14 (drift). Second pass (post-resync): stored R=10 (clean).
    arrangeSweepPeriod([{ R: 14, AB: 40, H: 12 }, { R: 10, AB: 40, H: 12 }]);
    const resync = vi.fn().mockResolvedValue({ synced: 1 });

    const entries = await reconcileRecentlyClosedPeriods({ resync });

    expect(resync).toHaveBeenCalledWith(35);
    expect(entries[0]).toMatchObject({ status: "healed", mismatchesBefore: 1, mismatchesAfter: 0 });
    expect(mockErrorPush).not.toHaveBeenCalled();
  });

  it("alerts on persistent drift that survives a re-sync", async () => {
    // Drift in both passes — re-sync did not fix it (deeper problem).
    arrangeSweepPeriod([{ R: 14, AB: 40, H: 12 }, { R: 14, AB: 40, H: 12 }]);
    const resync = vi.fn().mockResolvedValue({ synced: 1 });

    const entries = await reconcileRecentlyClosedPeriods({ resync });

    expect(entries[0]).toMatchObject({ status: "drift", mismatchesBefore: 1, mismatchesAfter: 1 });
    expect(mockErrorPush).toHaveBeenCalledTimes(1);
    expect(mockErrorPush.mock.calls[0][0].message).toContain("PERSISTENT drift");
  });
});
