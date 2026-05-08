/**
 * Direct unit tests for processorService (todo #174).
 *
 * These tests exercise the service functions WITHOUT Express — no router,
 * no supertest, no auth helpers. The state-machine behavior under racing
 * writers is covered end-to-end by the existing reducer/finalize tests
 * via the route layer; this file is the cheaper, more direct twin and
 * locks down the service contract used by routes (and, in the future,
 * by other call sites — cron auto-finalize, MCP tools, etc.).
 *
 * Pattern mirrors `__tests__/reducer.test.ts` for mock setup so failures
 * triage the same way.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../../db/prisma.js", () => {
  const tx = {
    waiverPeriod: {
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    waiverAddEntry: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    waiverDropEntry: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    roster: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    transactionEvent: { createMany: vi.fn() },
    player: { findUnique: vi.fn() },
  };
  return {
    prisma: {
      waiverAddEntry: {
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      waiverDropEntry: { findMany: vi.fn() },
      roster: { findFirst: vi.fn() },
      league: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: any) => {
        if (typeof fn === "function") return fn(tx);
        return Promise.all(fn);
      }),
      __mockTx: tx,
    },
  };
});

vi.mock("../../../../lib/utils.js", () => ({
  nextDayEffective: () => new Date("2026-05-07T00:00:00Z"),
}));
vi.mock("../../../../lib/featureFlags.js", () => ({
  enforceRosterRules: () => false,
}));
vi.mock("../../../transactions/lib/positionInherit.js", () => ({
  isEligibleForSlot: () => true,
}));
vi.mock("../../../../lib/mlbTeams.js", () => ({
  getLeagueStatsSource: vi.fn().mockResolvedValue("MLB_ALL"),
  getTeamsForSource: vi.fn().mockReturnValue(null),
}));

import { Prisma } from "@prisma/client";
import { prisma } from "../../../../db/prisma.js";
import {
  WireListServiceError,
  succeedAdd,
  finalizePeriod,
  revertAdd,
  type LoadedAddEntry,
} from "../processorService.js";

const mockPrisma = prisma as any;
const mockTx = mockPrisma.__mockTx;

beforeEach(() => {
  vi.clearAllMocks();
});

const makeLoadedEntry = (overrides: Partial<LoadedAddEntry> = {}): LoadedAddEntry =>
  ({
    id: 10,
    periodId: 1,
    teamId: 5,
    playerId: 100,
    outcome: "PENDING",
    consumedDropEntryId: null,
    reason: null,
    period: { id: 1, leagueId: 7, createdAt: new Date("2026-05-01"), status: "LOCKED" },
    ...overrides,
  } as LoadedAddEntry);

// ──────────────────────────────────────────────────────────────────
// succeedAdd
// ──────────────────────────────────────────────────────────────────

describe("succeedAdd", () => {
  it("happy path → returns updated entry with consumedDropEntryId", async () => {
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce(null) // pre-tx: not on a roster
      .mockResolvedValueOnce(null); // pre-tx: not acquired this period
    mockTx.waiverDropEntry.findFirst.mockResolvedValue({
      id: 200,
      periodId: 1,
      teamId: 5,
      playerId: 888,
      priority: 1,
      status: "PENDING",
      dropMode: "RELEASE",
    });
    mockTx.roster.findFirst.mockResolvedValue({ id: 555, assignedPosition: "OF" });
    mockTx.waiverDropEntry.updateMany.mockResolvedValue({ count: 1 });
    mockTx.waiverAddEntry.update.mockResolvedValue({
      id: 10,
      outcome: "SUCCEEDED",
      consumedDropEntryId: 200,
    });

    const result = await succeedAdd(makeLoadedEntry());

    expect(result.consumedDropEntryId).toBe(200);
    expect(result.updated.outcome).toBe("SUCCEEDED");
    expect(mockTx.waiverDropEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 200, status: "PENDING" },
        data: { status: "CONSUMED" },
      }),
    );
  });

  it("race-loss (P2002 on consumedDropEntryId) → throws 409 DROP_RACE_LOST", async () => {
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockTx.waiverDropEntry.findFirst.mockResolvedValue({
      id: 201,
      periodId: 1,
      teamId: 5,
      playerId: 889,
      priority: 1,
      status: "PENDING",
      dropMode: "RELEASE",
    });
    mockTx.roster.findFirst.mockResolvedValue({ id: 556, assignedPosition: "OF" });
    mockTx.waiverDropEntry.updateMany.mockResolvedValue({ count: 1 });
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["consumedDropEntryId"] },
    });
    mockTx.waiverAddEntry.update.mockRejectedValue(p2002);

    await expect(succeedAdd(makeLoadedEntry({ id: 12 }))).rejects.toMatchObject({
      status: 409,
      code: "DROP_RACE_LOST",
    });
  });

  it("status-CAS race (count===0) → throws 409 DROP_RACE_LOST", async () => {
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockTx.waiverDropEntry.findFirst.mockResolvedValue({
      id: 202,
      periodId: 1,
      teamId: 5,
      playerId: 890,
      priority: 1,
      status: "PENDING",
      dropMode: "RELEASE",
    });
    mockTx.roster.findFirst.mockResolvedValue({ id: 557, assignedPosition: "OF" });
    // sibling claimed it first → CAS hits zero rows
    mockTx.waiverDropEntry.updateMany.mockResolvedValue({ count: 0 });

    await expect(succeedAdd(makeLoadedEntry())).rejects.toMatchObject({
      status: 409,
      code: "DROP_RACE_LOST",
    });
  });

  it("player already on a roster → 409 PLAYER_NOT_FA", async () => {
    mockPrisma.roster.findFirst.mockResolvedValueOnce({ id: 99 }); // on a roster

    const promise = succeedAdd(makeLoadedEntry());
    await expect(promise).rejects.toBeInstanceOf(WireListServiceError);
    await expect(promise).rejects.toMatchObject({
      status: 409,
      code: "PLAYER_NOT_FA",
    });
  });

  it("no PENDING drops left → 409 NO_DROP_AVAILABLE", async () => {
    mockPrisma.roster.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockTx.waiverDropEntry.findFirst.mockResolvedValue(null);

    await expect(succeedAdd(makeLoadedEntry())).rejects.toMatchObject({
      status: 409,
      code: "NO_DROP_AVAILABLE",
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// finalizePeriod
// ──────────────────────────────────────────────────────────────────

describe("finalizePeriod", () => {
  const happyPeriod = {
    id: 1,
    leagueId: 7,
    status: "LOCKED" as const,
    createdAt: new Date("2026-05-01"),
  };

  it("happy path: 1 succeeded add → addsApplied===1 + period flipped to PROCESSED", async () => {
    mockPrisma.waiverAddEntry.count.mockResolvedValue(0); // no PENDING
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    mockTx.waiverPeriod.updateMany.mockResolvedValue({ count: 1 }); // CAS pass
    mockTx.waiverAddEntry.findMany.mockResolvedValue([
      {
        id: 30,
        periodId: 1,
        teamId: 5,
        playerId: 500,
        outcome: "SUCCEEDED",
        consumedDropEntryId: 600,
        reason: null,
        consumedDrop: {
          id: 600,
          periodId: 1,
          teamId: 5,
          playerId: 700,
          status: "CONSUMED",
          dropMode: "RELEASE",
          priority: 1,
          player: { name: "Drop Guy" },
        },
        player: { id: 500, name: "Add Guy", posPrimary: "OF", posList: "OF" },
      },
    ]);
    mockTx.roster.findFirst
      .mockResolvedValueOnce(null) // stillFA → ok
      .mockResolvedValueOnce({ id: 1500 }); // drop player still on team
    mockTx.player.findUnique.mockResolvedValue({ mlbTeam: "FA" });
    mockTx.roster.findMany.mockResolvedValue([
      { id: 1500, teamId: 5, playerId: 700, assignedPosition: "OF" },
    ]);
    mockTx.roster.updateMany.mockResolvedValue({ count: 1 });
    mockTx.roster.create.mockResolvedValue({ id: 9999 });
    mockTx.transactionEvent.createMany.mockResolvedValue({ count: 2 });
    mockTx.waiverAddEntry.updateMany.mockResolvedValue({ count: 1 });
    mockTx.waiverDropEntry.updateMany
      .mockResolvedValueOnce({ count: 1 }) // processedAt for processedDropIds
      .mockResolvedValueOnce({ count: 0 }); // unusedDrops UNUSED
    mockTx.waiverPeriod.update.mockResolvedValue({
      id: 1,
      status: "PROCESSED",
      processedAt: new Date(),
    });

    const result = await finalizePeriod(happyPeriod);

    expect(result.addsApplied).toBe(1);
    expect(result.dropsConsumed).toBe(1);
    expect(result.period.status).toBe("PROCESSED");
    expect(result.successesByTeam.get(5)).toEqual(["Add Guy"]);
  });

  it("PENDING add blocks finalize → throws 409 FINALIZE_BLOCKED with pendingAdds in extra", async () => {
    mockPrisma.waiverAddEntry.count.mockResolvedValue(2);

    await expect(finalizePeriod(happyPeriod)).rejects.toMatchObject({
      status: 409,
      code: "FINALIZE_BLOCKED",
      extra: { pendingAdds: 2 },
    });
  });

  it("non-LOCKED period → throws 403 PERIOD_NOT_LOCKED before any DB read", async () => {
    await expect(
      finalizePeriod({ ...happyPeriod, status: "PROCESSED" }),
    ).rejects.toMatchObject({
      status: 403,
      code: "PERIOD_NOT_LOCKED",
    });
    expect(mockPrisma.waiverAddEntry.count).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────
// revertAdd
// ──────────────────────────────────────────────────────────────────

describe("revertAdd", () => {
  it("clears consumedDropEntryId and flips drop back to PENDING", async () => {
    mockTx.waiverAddEntry.update.mockResolvedValue({
      id: 20,
      outcome: "PENDING",
      consumedDropEntryId: null,
    });
    mockTx.waiverDropEntry.updateMany.mockResolvedValue({ count: 1 });

    const result = await revertAdd({ id: 20, consumedDropEntryId: 300 });

    expect(result.outcome).toBe("PENDING");
    expect(result.consumedDropEntryId).toBeNull();
    // FK cleared first
    expect(mockTx.waiverAddEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 20 },
        data: { outcome: "PENDING", consumedDropEntryId: null, reason: null },
      }),
    );
    // Then drop CAS back to PENDING
    expect(mockTx.waiverDropEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 300, status: "CONSUMED" },
        data: { status: "PENDING", processedAt: null },
      }),
    );
  });

  it("no-op drop release when consumedDropEntryId is null", async () => {
    mockTx.waiverAddEntry.update.mockResolvedValue({
      id: 21,
      outcome: "PENDING",
      consumedDropEntryId: null,
    });

    await revertAdd({ id: 21, consumedDropEntryId: null });

    expect(mockTx.waiverDropEntry.updateMany).not.toHaveBeenCalled();
  });

  it("P2002 from concurrent succeed → throws 409 DROP_RACE_LOST", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["consumedDropEntryId"] },
    });
    mockTx.waiverAddEntry.update.mockRejectedValue(p2002);

    await expect(revertAdd({ id: 22, consumedDropEntryId: 301 })).rejects.toMatchObject({
      status: 409,
      code: "DROP_RACE_LOST",
    });
  });
});
