import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ──────────────────────────────────────────────

const mockTx = {
  $queryRaw: vi.fn().mockResolvedValue([]),
  period: { findUnique: vi.fn() },
  leagueRule: { findMany: vi.fn().mockResolvedValue([]) },
  rosterSlotEvent: { findMany: vi.fn().mockResolvedValue([]) },
  financeLedger: {
    findMany: vi.fn().mockResolvedValue([]),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    update: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("../../../../db/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: any) => fn(mockTx)),
  },
}));

vi.mock("../../../../lib/auditLog.js", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("../../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  deriveAllStints,
  reconcileIlFeesForPeriod,
} from "../ilFeeService.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.leagueRule.findMany.mockResolvedValue([]);
  mockTx.rosterSlotEvent.findMany.mockResolvedValue([]);
  mockTx.financeLedger.findMany.mockResolvedValue([]);
  mockTx.financeLedger.createMany.mockResolvedValue({ count: 0 });
});

// ── deriveAllStints ──────────────────────────────────────────────

describe("deriveAllStints", () => {
  const upTo = new Date("2026-06-01T00:00:00Z");

  it("pairs IL_STASH with next IL_ACTIVATE for same (team, player)", async () => {
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH",    effDate: new Date("2026-04-05Z"), player: { name: "Alpha" } },
      { id: 2, teamId: 10, playerId: 100, event: "IL_ACTIVATE", effDate: new Date("2026-04-15Z"), player: { name: "Alpha" } },
    ]);
    const stints = await deriveAllStints(mockTx as any, 1, upTo);
    expect(stints).toHaveLength(1);
    expect(stints[0]).toMatchObject({
      teamId: 10, playerId: 100,
      startedAt: new Date("2026-04-05Z"),
      endedAt: new Date("2026-04-15Z"),
      rankAtEntry: 1,
    });
  });

  it("pairs IL_STASH with next IL_RELEASE (drop of an IL player)", async () => {
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH",   effDate: new Date("2026-04-05Z"), player: { name: "Alpha" } },
      { id: 2, teamId: 10, playerId: 100, event: "IL_RELEASE", effDate: new Date("2026-04-12Z"), player: { name: "Alpha" } },
    ]);
    const stints = await deriveAllStints(mockTx as any, 1, upTo);
    expect(stints).toHaveLength(1);
    expect(stints[0].endedAt).toEqual(new Date("2026-04-12Z"));
  });

  it("leaves an open stint (no closing event) with endedAt = null", async () => {
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH", effDate: new Date("2026-04-05Z"), player: { name: "Alpha" } },
    ]);
    const stints = await deriveAllStints(mockTx as any, 1, upTo);
    expect(stints).toHaveLength(1);
    expect(stints[0].endedAt).toBeNull();
  });

  it("assigns rank 1 for a solo-on-team stint, rank 2 when another is already open", async () => {
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      // Alpha stashes first (alone → rank 1)
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH", effDate: new Date("2026-04-05Z"), player: { name: "Alpha" } },
      // Bravo stashes later while Alpha still on IL (→ rank 2)
      { id: 2, teamId: 10, playerId: 200, event: "IL_STASH", effDate: new Date("2026-04-10Z"), player: { name: "Bravo" } },
    ]);
    const stints = await deriveAllStints(mockTx as any, 1, upTo);
    const alpha = stints.find(s => s.playerId === 100);
    const bravo = stints.find(s => s.playerId === 200);
    expect(alpha?.rankAtEntry).toBe(1);
    expect(bravo?.rankAtEntry).toBe(2);
  });

  it("gives rank 1 to a stint that enters AFTER another stint closed (sticky after drop)", async () => {
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH",    effDate: new Date("2026-04-05Z"), player: { name: "Alpha" } },
      { id: 2, teamId: 10, playerId: 100, event: "IL_ACTIVATE", effDate: new Date("2026-04-08Z"), player: { name: "Alpha" } },
      { id: 3, teamId: 10, playerId: 200, event: "IL_STASH",    effDate: new Date("2026-04-10Z"), player: { name: "Bravo" } },
    ]);
    const stints = await deriveAllStints(mockTx as any, 1, upTo);
    const bravo = stints.find(s => s.playerId === 200);
    expect(bravo?.rankAtEntry).toBe(1);
  });

  it("scopes rank computation per team (two teams both start at rank 1)", async () => {
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH", effDate: new Date("2026-04-05Z"), player: { name: "Alpha" } },
      { id: 2, teamId: 20, playerId: 300, event: "IL_STASH", effDate: new Date("2026-04-05Z"), player: { name: "Charlie" } },
    ]);
    const stints = await deriveAllStints(mockTx as any, 1, upTo);
    expect(stints).toHaveLength(2);
    for (const s of stints) {
      expect(s.rankAtEntry).toBe(1);
    }
  });
});

// ── reconcileIlFeesForPeriod ─────────────────────────────────────

describe("reconcileIlFeesForPeriod", () => {
  const period = {
    id: 7, leagueId: 1,
    startDate: new Date("2026-04-01Z"), endDate: new Date("2026-04-14Z"),
    name: "Period 1",
  };

  const RULES = [
    { key: "il_slot_1_cost", value: "10" },
    { key: "il_slot_2_cost", value: "15" },
  ];

  beforeEach(() => {
    mockTx.period.findUnique.mockResolvedValue(period);
    mockTx.leagueRule.findMany.mockResolvedValue(RULES);
  });

  it("writes il_fee rows for billable stints overlapping the period", async () => {
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH", effDate: new Date("2026-04-05Z"), player: { name: "Alpha" } },
    ]);

    const result = await reconcileIlFeesForPeriod(1, 7, { actorUserId: 42 });
    expect(result).toMatchObject({ added: 1, voided: 0, unchanged: 0, dryRun: false });
    expect(mockTx.financeLedger.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            teamId: 10, playerId: 100, periodId: 7,
            type: "il_fee", amount: 10,
          }),
        ]),
        skipDuplicates: true,
      }),
    );
  });

  it("rank 2 stint gets il_slot_2_cost", async () => {
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH", effDate: new Date("2026-04-02Z"), player: { name: "A" } },
      { id: 2, teamId: 10, playerId: 200, event: "IL_STASH", effDate: new Date("2026-04-05Z"), player: { name: "B" } },
    ]);

    await reconcileIlFeesForPeriod(1, 7);
    const createCall = (mockTx.financeLedger.createMany as any).mock.calls[0][0];
    const amounts = createCall.data.map((d: any) => d.amount).sort();
    expect(amounts).toEqual([10, 15]);
  });

  it("does NOT bill stints entirely outside the period", async () => {
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH",    effDate: new Date("2026-03-01Z"), player: { name: "X" } },
      { id: 2, teamId: 10, playerId: 100, event: "IL_ACTIVATE", effDate: new Date("2026-03-20Z"), player: { name: "X" } },
    ]);

    await reconcileIlFeesForPeriod(1, 7);
    expect(mockTx.financeLedger.createMany).not.toHaveBeenCalled();
  });

  it("DOES bill stints that end inside the period (presence-based, Q17=b)", async () => {
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH",    effDate: new Date("2026-03-25Z"), player: { name: "X" } },
      { id: 2, teamId: 10, playerId: 100, event: "IL_ACTIVATE", effDate: new Date("2026-04-02Z"), player: { name: "X" } },
    ]);

    await reconcileIlFeesForPeriod(1, 7);
    expect(mockTx.financeLedger.createMany).toHaveBeenCalled();
  });

  it("dryRun returns counts without writing", async () => {
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH", effDate: new Date("2026-04-05Z"), player: { name: "A" } },
    ]);

    const result = await reconcileIlFeesForPeriod(1, 7, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.added).toBe(1);
    expect(mockTx.financeLedger.createMany).not.toHaveBeenCalled();
    expect(mockTx.financeLedger.update).not.toHaveBeenCalled();
    expect(mockTx.financeLedger.create).not.toHaveBeenCalled();
  });

  it("IDOR guard: rejects period that does not belong to league", async () => {
    mockTx.period.findUnique.mockResolvedValue({ ...period, leagueId: 999 });
    await expect(reconcileIlFeesForPeriod(1, 7)).rejects.toThrow(/does not belong to league/);
  });

  it("rejects when period not found", async () => {
    mockTx.period.findUnique.mockResolvedValue(null);
    await expect(reconcileIlFeesForPeriod(1, 7)).rejects.toThrow(/not found/);
  });

  it("counts unchanged rows when ledger already matches desired state", async () => {
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH", effDate: new Date("2026-04-05Z"), player: { name: "A" } },
    ]);
    mockTx.financeLedger.findMany.mockResolvedValue([
      { id: 500, teamId: 10, playerId: 100, amount: 10 },
    ]);

    const result = await reconcileIlFeesForPeriod(1, 7);
    expect(result).toMatchObject({ added: 0, voided: 0, unchanged: 1 });
    expect(mockTx.financeLedger.createMany).not.toHaveBeenCalled();
  });

  it("voids + writes reversal entry when existing row's amount no longer matches", async () => {
    // Stint is still billable at rank 1 ($10); but existing row says $15.
    // Reconciler should void the $15 row, write a -$15 reversal, and add a $10 row.
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH", effDate: new Date("2026-04-05Z"), player: { name: "A" } },
    ]);
    mockTx.financeLedger.findMany.mockResolvedValue([
      { id: 500, teamId: 10, playerId: 100, amount: 15 },
    ]);

    const result = await reconcileIlFeesForPeriod(1, 7);
    expect(result).toMatchObject({ added: 1, voided: 1 });
    expect(mockTx.financeLedger.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 500 },
        data: expect.objectContaining({ voidedAt: expect.any(Date) }),
      }),
    );
    expect(mockTx.financeLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "il_fee", amount: -15, reversalOf: 500,
        }),
      }),
    );
  });

  it("voids + reverses when a stint is no longer billable (backdate wiped it)", async () => {
    // No stint events → all existing il_fee rows should be voided + reversed.
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([]);
    mockTx.financeLedger.findMany.mockResolvedValue([
      { id: 500, teamId: 10, playerId: 100, amount: 10 },
    ]);

    const result = await reconcileIlFeesForPeriod(1, 7);
    expect(result).toMatchObject({ added: 0, voided: 1 });
    expect(mockTx.financeLedger.update).toHaveBeenCalled();
    expect(mockTx.financeLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: -10, reversalOf: 500 }),
      }),
    );
    // NEVER a DELETE — append-only invariant.
    expect(mockTx.financeLedger).not.toHaveProperty("delete");
  });

  it("takes an advisory lock on the period", async () => {
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([]);
    mockTx.financeLedger.findMany.mockResolvedValue([]);
    await reconcileIlFeesForPeriod(1, 7);
    expect(mockTx.$queryRaw).toHaveBeenCalled();
  });
});
