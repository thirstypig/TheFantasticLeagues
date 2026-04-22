import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────

const { mockReconcileIlFeesForPeriods, mockPrisma } = vi.hoisted(() => ({
  mockReconcileIlFeesForPeriods: vi.fn(),
  mockPrisma: {
    $queryRaw: vi.fn(),
    outboxEvent: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../../features/transactions/services/ilFeeService.js", () => ({
  reconcileIlFeesForPeriods: (...args: any[]) => mockReconcileIlFeesForPeriods(...args),
}));
vi.mock("../logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  drainOutboxOnce,
  enqueueIlFeeReconcile,
  startOutboxDrainer,
  stopOutboxDrainer,
} from "../outboxDrainer.js";

beforeEach(() => {
  vi.clearAllMocks();
  stopOutboxDrainer(); // reset module-level timer between tests
  mockPrisma.$queryRaw.mockResolvedValue([]);
  mockPrisma.outboxEvent.create.mockResolvedValue({ id: 1 });
  mockPrisma.outboxEvent.update.mockResolvedValue({});
  mockReconcileIlFeesForPeriods.mockResolvedValue([]);
});

// ── drainOutboxOnce ──────────────────────────────────────────────

describe("drainOutboxOnce", () => {
  it("returns 0 when no pending events", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const processed = await drainOutboxOnce();
    expect(processed).toBe(0);
    expect(mockReconcileIlFeesForPeriods).not.toHaveBeenCalled();
  });

  it("processes an IL_FEE_RECONCILE event and marks completedAt", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 42, kind: "IL_FEE_RECONCILE", payload: { leagueId: 1, periodIds: [7, 8] }, attempts: 0 },
    ]);

    const processed = await drainOutboxOnce();
    expect(processed).toBe(1);
    expect(mockReconcileIlFeesForPeriods).toHaveBeenCalledWith(1, [7, 8], { actorUserId: null });
    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: expect.objectContaining({
        completedAt: expect.any(Date),
        attempts: 1,
      }),
    });
  });

  it("processes multiple events in a single tick", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 1, kind: "IL_FEE_RECONCILE", payload: { leagueId: 1, periodIds: [7] }, attempts: 0 },
      { id: 2, kind: "IL_FEE_RECONCILE", payload: { leagueId: 2, periodIds: [9] }, attempts: 0 },
      { id: 3, kind: "IL_FEE_RECONCILE", payload: { leagueId: 1, periodIds: [8] }, attempts: 0 },
    ]);

    const processed = await drainOutboxOnce();
    expect(processed).toBe(3);
    expect(mockReconcileIlFeesForPeriods).toHaveBeenCalledTimes(3);
    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledTimes(3);
  });

  it("uses SELECT FOR UPDATE SKIP LOCKED (raw SQL verified)", async () => {
    await drainOutboxOnce();
    const rawCall = (mockPrisma.$queryRaw as any).mock.calls[0];
    // $queryRaw receives a tagged template literal — first arg is the strings array
    const sql = (rawCall[0] as any).join(" ");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("completedAt");
  });

  it("records lastError + increments attempts when dispatch throws", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 42, kind: "IL_FEE_RECONCILE", payload: { leagueId: 1, periodIds: [7] }, attempts: 2 },
    ]);
    mockReconcileIlFeesForPeriods.mockRejectedValue(new Error("DB deadlock"));

    const processed = await drainOutboxOnce();
    expect(processed).toBe(1); // still counted — row was picked up
    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: expect.objectContaining({
        attempts: 3,
        lastError: expect.stringContaining("DB deadlock"),
      }),
    });
    // Critically: NOT marked completedAt on failure
    const updateCall = (mockPrisma.outboxEvent.update as any).mock.calls[0][0];
    expect(updateCall.data.completedAt).toBeUndefined();
  });

  it("truncates very long error messages to 500 chars on the row", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 42, kind: "IL_FEE_RECONCILE", payload: { leagueId: 1, periodIds: [7] }, attempts: 0 },
    ]);
    const longMsg = "x".repeat(2000);
    mockReconcileIlFeesForPeriods.mockRejectedValue(new Error(longMsg));

    await drainOutboxOnce();
    const updateCall = (mockPrisma.outboxEvent.update as any).mock.calls[0][0];
    expect(updateCall.data.lastError.length).toBeLessThanOrEqual(500);
  });

  it("isolates failures — one failing event does not prevent sibling events from processing", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 1, kind: "IL_FEE_RECONCILE", payload: { leagueId: 1, periodIds: [7] }, attempts: 0 },
      { id: 2, kind: "IL_FEE_RECONCILE", payload: { leagueId: 1, periodIds: [8] }, attempts: 0 },
    ]);
    mockReconcileIlFeesForPeriods
      .mockRejectedValueOnce(new Error("first fails"))
      .mockResolvedValueOnce([]);

    const processed = await drainOutboxOnce();
    expect(processed).toBe(2);
    // 1st updated with lastError, 2nd with completedAt
    const calls = (mockPrisma.outboxEvent.update as any).mock.calls;
    expect(calls[0][0].data.lastError).toContain("first fails");
    expect(calls[0][0].data.completedAt).toBeUndefined();
    expect(calls[1][0].data.completedAt).toBeInstanceOf(Date);
  });

  it("rejects IL_FEE_RECONCILE with missing leagueId", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 42, kind: "IL_FEE_RECONCILE", payload: { periodIds: [7] }, attempts: 0 },
    ]);

    await drainOutboxOnce();
    expect(mockReconcileIlFeesForPeriods).not.toHaveBeenCalled();
    const updateCall = (mockPrisma.outboxEvent.update as any).mock.calls[0][0];
    expect(updateCall.data.lastError).toContain("missing leagueId");
  });

  it("rejects IL_FEE_RECONCILE with empty periodIds", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 42, kind: "IL_FEE_RECONCILE", payload: { leagueId: 1, periodIds: [] }, attempts: 0 },
    ]);

    await drainOutboxOnce();
    expect(mockReconcileIlFeesForPeriods).not.toHaveBeenCalled();
  });

  it("rejects unknown kind with lastError (won't silently no-op)", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 42, kind: "UNKNOWN_KIND", payload: {}, attempts: 0 },
    ]);

    await drainOutboxOnce();
    const updateCall = (mockPrisma.outboxEvent.update as any).mock.calls[0][0];
    expect(updateCall.data.lastError).toContain("Unknown outbox kind");
    expect(mockReconcileIlFeesForPeriods).not.toHaveBeenCalled();
  });
});

// ── enqueueIlFeeReconcile ────────────────────────────────────────

describe("enqueueIlFeeReconcile", () => {
  it("creates an OutboxEvent with the correct payload shape", async () => {
    await enqueueIlFeeReconcile(null, 1, [7, 8]);
    expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        kind: "IL_FEE_RECONCILE",
        payload: { leagueId: 1, periodIds: [7, 8] },
      },
    });
  });

  it("is a no-op for empty periodIds (no row written)", async () => {
    await enqueueIlFeeReconcile(null, 1, []);
    expect(mockPrisma.outboxEvent.create).not.toHaveBeenCalled();
  });

  it("uses a provided tx client instead of global prisma when given", async () => {
    const mockTxCreate = vi.fn().mockResolvedValue({ id: 99 });
    const tx = { outboxEvent: { create: mockTxCreate } };
    await enqueueIlFeeReconcile(tx, 1, [7]);
    expect(mockTxCreate).toHaveBeenCalled();
    expect(mockPrisma.outboxEvent.create).not.toHaveBeenCalled();
  });
});

// ── startOutboxDrainer / stopOutboxDrainer ───────────────────────

describe("startOutboxDrainer", () => {
  it("is idempotent — calling twice does not create a second timer", async () => {
    vi.useFakeTimers();
    try {
      startOutboxDrainer();
      startOutboxDrainer(); // should no-op
      // One setInterval means exactly one scheduled tick per 5s window
      await vi.advanceTimersByTimeAsync(5_100);
      // Drainer ticks → $queryRaw called once per tick (not twice)
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    } finally {
      stopOutboxDrainer();
      vi.useRealTimers();
    }
  });

  it("stopOutboxDrainer clears the interval", async () => {
    vi.useFakeTimers();
    try {
      startOutboxDrainer();
      stopOutboxDrainer();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
