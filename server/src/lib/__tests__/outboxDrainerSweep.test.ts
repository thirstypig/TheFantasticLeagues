import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The DB-touching orchestrators around the pure helpers in `outboxHealth.ts`
 * and `ilLogDrift.ts`. Those helpers are unit-tested separately; these cover
 * what lives only here — and this code runs UNATTENDED every hour in prod, so
 * a defect writes real outbox events nobody asked for.
 */

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    period: { findMany: vi.fn() },
    outboxEvent: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    transactionEvent: { findMany: vi.fn() },
    rosterSlotEvent: { findMany: vi.fn() },
  },
}));

vi.mock("../../db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../features/transactions/services/ilFeeService.js", () => ({
  reconcileIlFeesForPeriods: vi.fn(),
}));

import {
  sweepMissingFeeReconciles,
  findStuckOutboxEvents,
  findIlLogDriftAll,
} from "../outboxDrainer.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.outboxEvent.create.mockResolvedValue({ id: 1 });
});

describe("sweepMissingFeeReconciles", () => {
  const period = (id: number, leagueId: number) => ({ id, status: "completed", leagueId });
  const event = (periodIds: number[], completedAt: Date | null) => ({ payload: { periodIds }, completedAt });

  it("enqueues nothing when every closed period already has a successful reconcile", async () => {
    // Regression this prevents: an hourly job that re-enqueues forever, filling
    // the outbox with duplicate work every single hour.
    mockPrisma.period.findMany.mockResolvedValue([period(36, 20), period(37, 20)]);
    mockPrisma.outboxEvent.findMany.mockResolvedValue([event([36, 37], new Date())]);

    const n = await sweepMissingFeeReconciles();

    expect(n).toBe(0);
    expect(mockPrisma.outboxEvent.create).not.toHaveBeenCalled();
  });

  it("enqueues for a closed period whose event EXISTS but never completed", async () => {
    // Outbox rows 1 and 2 sat at attempts=5 for two months. An event that exists
    // is not an event that ran — counting existence is what made them look
    // handled.
    mockPrisma.period.findMany.mockResolvedValue([period(36, 20)]);
    mockPrisma.outboxEvent.findMany.mockResolvedValue([event([36], null)]);

    const n = await sweepMissingFeeReconciles();

    expect(n).toBe(1);
    expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "IL_FEE_RECONCILE",
          payload: { leagueId: 20, periodIds: [36] },
        }),
      }),
    );
  });

  it("emits ONE event per league carrying that league's period ids", async () => {
    // Regression this prevents: a payload mixing leagues, or one event per
    // period. reconcileIlFeesForPeriods is IDOR-checked per league — a mixed
    // payload would throw at drain time, after the enqueue looked fine.
    mockPrisma.period.findMany.mockResolvedValue([
      period(36, 20), period(37, 20), period(50, 99),
    ]);
    mockPrisma.outboxEvent.findMany.mockResolvedValue([]);

    const n = await sweepMissingFeeReconciles();

    expect(n).toBe(2);
    const payloads = mockPrisma.outboxEvent.create.mock.calls.map((c) => c[0].data.payload);
    expect(payloads).toContainEqual({ leagueId: 20, periodIds: [36, 37] });
    expect(payloads).toContainEqual({ leagueId: 99, periodIds: [50] });
  });

  it("does nothing when there are no closed periods at all", async () => {
    mockPrisma.period.findMany.mockResolvedValue([]);
    mockPrisma.outboxEvent.findMany.mockResolvedValue([]);
    expect(await sweepMissingFeeReconciles()).toBe(0);
  });
});

describe("findStuckOutboxEvents", () => {
  it("queries only incomplete events and returns those at the attempt ceiling", async () => {
    mockPrisma.outboxEvent.findMany.mockResolvedValue([
      { id: 1, kind: "IL_FEE_RECONCILE", attempts: 5, completedAt: null, lastError: "42883" },
      { id: 9, kind: "IL_FEE_RECONCILE", attempts: 2, completedAt: null, lastError: null },
    ]);

    const out = await findStuckOutboxEvents();

    expect(mockPrisma.outboxEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { completedAt: null } }),
    );
    expect(out.map((e) => e.id)).toEqual([1]);
  });
});

describe("findIlLogDriftAll", () => {
  it("drops transaction rows with null keys instead of crashing on them", async () => {
    // TransactionEvent.teamId / playerId / effDate are all nullable. A null key
    // would produce a garbage comparison key and a phantom drift row — or throw.
    mockPrisma.transactionEvent.findMany.mockResolvedValue([
      { teamId: null, playerId: 1, effDate: new Date("2026-04-19"), transactionType: "IL_STASH" },
      { teamId: 10, playerId: null, effDate: new Date("2026-04-19"), transactionType: "IL_STASH" },
      { teamId: 10, playerId: 1, effDate: new Date("2026-04-19"), transactionType: "IL_STASH" },
    ]);
    mockPrisma.rosterSlotEvent.findMany.mockResolvedValue([
      { teamId: 10, playerId: 1, effDate: new Date("2026-04-19"), event: "IL_STASH" },
    ]);

    const out = await findIlLogDriftAll();

    // The one well-formed pair matches; the two null-keyed rows are dropped.
    expect(out).toEqual([]);
  });
});
