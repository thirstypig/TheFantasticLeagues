import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ──────────────────────────────────────────────

const mockTx = {
  $queryRaw: vi.fn().mockResolvedValue([]),
  $executeRaw: vi.fn().mockResolvedValue(1), // advisory lock (pg_advisory_xact_lock)
  period: { findUnique: vi.fn() },
  leagueRule: { findMany: vi.fn().mockResolvedValue([]) },
  rosterSlotEvent: { findMany: vi.fn().mockResolvedValue([]) },
  financeLedger: {
    findMany: vi.fn().mockResolvedValue([]),
    createMany: vi.fn(async (args: any) => ({ count: args?.data?.length ?? 0 })),
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
  mockTx.financeLedger.createMany.mockImplementation(async (args: any) => ({ count: args?.data?.length ?? 0 }));
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

  it("dryRun preview carries the rank-based amount ($10 rank 1, $15 rank 2)", async () => {
    // Two concurrent stints on the same team: Alpha alone → rank 1; Bravo while
    // Alpha still on IL → rank 2. Guards the rate-selection ternary — a flipped
    // rank→rate mapping would let the commissioner approve the wrong fee.
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH", effDate: new Date("2026-04-05Z"), player: { name: "Alpha" } },
      { id: 2, teamId: 10, playerId: 200, event: "IL_STASH", effDate: new Date("2026-04-10Z"), player: { name: "Bravo" } },
    ]);
    mockTx.financeLedger.findMany.mockResolvedValue([]);

    const result = await reconcileIlFeesForPeriod(1, 7, { dryRun: true });
    expect(result.preview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "add", playerId: 100, rank: 1, amount: 10 }),
        expect.objectContaining({ action: "add", playerId: 200, rank: 2, amount: 15 }),
      ]),
    );
    expect(mockTx.financeLedger.createMany).not.toHaveBeenCalled();
  });

  it("dryRun preview carries a negated amount for a no-longer-billable void", async () => {
    // No stint events → the existing $10 fee is no longer billable and should
    // show as a void of -10. Guards the reversal sign in the preview builder.
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([]);
    mockTx.financeLedger.findMany.mockResolvedValue([
      { id: 500, teamId: 10, playerId: 100, amount: 10 },
    ]);

    const result = await reconcileIlFeesForPeriod(1, 7, { dryRun: true });
    expect(result.voided).toBe(1);
    expect(result.preview).toEqual([
      expect.objectContaining({ action: "void", teamId: 10, playerId: 100, amount: -10 }),
    ]);
    expect(mockTx.financeLedger.update).not.toHaveBeenCalled();
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

  it("takes the advisory lock via $executeRaw (blocking lock returns void — $queryRaw P2010s)", async () => {
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([]);
    mockTx.financeLedger.findMany.mockResolvedValue([]);
    await reconcileIlFeesForPeriod(1, 7);
    // Must use $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void,
    // which $queryRaw cannot deserialize. Real-PG regression: ilFeeService.integration.test.ts.
    expect(mockTx.$executeRaw).toHaveBeenCalled();
    expect(mockTx.$queryRaw).not.toHaveBeenCalled();
  });
});

// ── Reconcile repair bugs (found in prod 2026-08-31) ─────────────
//
// Applying a rank correction to Los Doyers' Period 6 reversed the old $15 but
// silently lost the replacement $10, leaving the team under-billed. Two
// independent defects produced that.

describe("reconcileIlFeesForPeriod — amount corrections", () => {
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
    // One lone stint → desired rank 1 = $10.
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH", effDate: new Date("2026-04-05Z"), player: { name: "Alpha" } },
    ]);
    // But an existing LIVE row has the wrong amount ($15) — the correction case.
    mockTx.financeLedger.findMany.mockResolvedValue([
      { id: 55, teamId: 10, playerId: 100, amount: 15 },
    ]);
  });

  it("voids the stale row BEFORE inserting the replacement", async () => {
    // The partial unique index is (teamId, periodId, playerId) WHERE
    // type='il_fee' AND voidedAt IS NULL. Inserting first collides with the
    // row about to be voided, and `skipDuplicates: true` drops the
    // replacement without error — the row is reversed and never re-added.
    await reconcileIlFeesForPeriod(1, 7, { actorUserId: 42 });

    const voidOrder = (mockTx.financeLedger.update as any).mock.invocationCallOrder[0];
    const addOrder = (mockTx.financeLedger.createMany as any).mock.invocationCallOrder[0];
    expect(voidOrder).toBeLessThan(addOrder);
  });

  it("actually writes the corrected amount", async () => {
    await reconcileIlFeesForPeriod(1, 7, { actorUserId: 42 });
    const call = (mockTx.financeLedger.createMany as any).mock.calls[0][0];
    expect(call.data).toEqual([
      expect.objectContaining({ teamId: 10, playerId: 100, amount: 10, type: "il_fee" }),
    ]);
  });

  it("excludes reversal contra-entries when reading existing charges", async () => {
    // Reversal rows are written as type='il_fee' with voidedAt=null, so they
    // re-enter `existing` on the next run and get "corrected" themselves —
    // producing a reversal-of-a-reversal cascade instead of converging.
    await reconcileIlFeesForPeriod(1, 7, { actorUserId: 42 });
    const where = (mockTx.financeLedger.findMany as any).mock.calls[0][0].where;
    expect(where).toMatchObject({ reversalOf: null });
  });
});

describe("reconcileIlFeesForPeriod — silent-insert-loss guard", () => {
  const period = {
    id: 7, leagueId: 1,
    startDate: new Date("2026-04-01Z"), endDate: new Date("2026-04-14Z"),
    name: "Period 1",
  };

  beforeEach(() => {
    mockTx.period.findUnique.mockResolvedValue(period);
    mockTx.leagueRule.findMany.mockResolvedValue([
      { key: "il_slot_1_cost", value: "10" },
      { key: "il_slot_2_cost", value: "15" },
    ]);
    mockTx.rosterSlotEvent.findMany.mockResolvedValue([
      { id: 1, teamId: 10, playerId: 100, event: "IL_STASH", effDate: new Date("2026-04-05Z"), player: { name: "Alpha" } },
    ]);
    mockTx.financeLedger.findMany.mockResolvedValue([]);
  });

  it("throws when createMany inserts fewer rows than intended", async () => {
    // `skipDuplicates: true` silently drops a row that collides with the
    // partial unique index — including a live reversal contra-entry squatting
    // the (teamId, periodId, playerId) slot. Twice in prod this reported
    // `added: 1` while writing nothing, because the createMany count was
    // discarded. Reporting intent as if it were reality is what made the
    // failure invisible.
    mockTx.financeLedger.createMany.mockResolvedValue({ count: 0 });
    await expect(reconcileIlFeesForPeriod(1, 7, { actorUserId: 42 }))
      .rejects.toThrow(/insert/i);
  });

  it("reports the ACTUAL inserted count, not the intended count", async () => {
    const r = await reconcileIlFeesForPeriod(1, 7, { actorUserId: 42 });
    expect(r.added).toBe(1);
    expect(mockTx.financeLedger.createMany).toHaveBeenCalledOnce();
  });
});
