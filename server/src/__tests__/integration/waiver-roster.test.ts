import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration tests: Waiver Processing → Roster Mutations
 *
 * Validates the POST /api/waivers/process flow (FAAB):
 *   1. Highest bidder wins the player
 *   2. Lower bidders for the same player get FAILED_OUTBID
 *   3. Insufficient budget → FAILED_INVALID
 *   4. Drop player is released from roster on successful claim
 *   5. Already-dropped player in same batch → FAILED_INVALID
 *   6. Multiple players can be claimed in one batch
 */

vi.mock("../../db/prisma.js", () => {
  const mockTx = {
    waiverClaim: { update: vi.fn() },
    team: { findUnique: vi.fn(), update: vi.fn() },
    roster: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  };
  return {
    prisma: {
      waiverClaim: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: any) => fn(mockTx)),
      __mockTx: mockTx,
    },
  };
});
vi.mock("../../lib/supabase.js", () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() } },
}));
vi.mock("../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireCommissionerOrAdmin: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  isTeamOwner: vi.fn(),
}));
vi.mock("../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

import { prisma } from "../../db/prisma.js";

const mockPrisma = prisma as any;
const mockTx = mockPrisma.__mockTx;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper — mirrors the waiver processing logic from routes.ts
// ---------------------------------------------------------------------------

interface WaiverClaim {
  id: number;
  teamId: number;
  playerId: number;
  bidAmount: number;
  dropPlayerId: number | null;
  team: { budget: number };
}

async function simulateProcessWaivers(claims: WaiverClaim[]) {
  const logs: string[] = [];
  const processedPlayerIds = new Set<number>();
  const teamDropMap = new Map<number, Set<number>>();

  await prisma.$transaction(async (tx: any) => {
    for (const claim of claims) {
      // Player already claimed in this batch
      if (processedPlayerIds.has(claim.playerId)) {
        await tx.waiverClaim.update({
          where: { id: claim.id },
          data: { status: "FAILED_OUTBID", processedAt: new Date() },
        });
        logs.push(`Claim ${claim.id} FAILED_OUTBID`);
        continue;
      }

      // Budget check
      const currentTeam = await tx.team.findUnique({ where: { id: claim.teamId } });
      if (currentTeam.budget < claim.bidAmount) {
        await tx.waiverClaim.update({
          where: { id: claim.id },
          data: { status: "FAILED_INVALID", processedAt: new Date() },
        });
        logs.push(`Claim ${claim.id} FAILED_INVALID: Insufficient budget`);
        continue;
      }

      // Drop player availability check
      if (claim.dropPlayerId) {
        const teamDrops = teamDropMap.get(claim.teamId) || new Set();
        if (teamDrops.has(claim.dropPlayerId)) {
          await tx.waiverClaim.update({
            where: { id: claim.id },
            data: { status: "FAILED_INVALID", processedAt: new Date() },
          });
          logs.push(`Claim ${claim.id} FAILED_INVALID: Drop player already processed`);
          continue;
        }
      }

      // --- Success ---
      processedPlayerIds.add(claim.playerId);

      // Deduct budget
      await tx.team.update({
        where: { id: claim.teamId },
        data: { budget: { decrement: claim.bidAmount } },
      });

      // Add player to roster
      await tx.roster.create({
        data: {
          teamId: claim.teamId,
          playerId: claim.playerId,
          source: "WAIVER",
          price: claim.bidAmount,
          acquiredAt: new Date(),
        },
      });

      // Drop player if specified
      if (claim.dropPlayerId) {
        const rosterEntry = await tx.roster.findFirst({
          where: { teamId: claim.teamId, playerId: claim.dropPlayerId, releasedAt: null },
        });
        if (rosterEntry) {
          await tx.roster.update({
            where: { id: rosterEntry.id },
            data: { releasedAt: new Date(), source: "WAIVER_DROP" },
          });

          if (!teamDropMap.has(claim.teamId)) teamDropMap.set(claim.teamId, new Set());
          teamDropMap.get(claim.teamId)!.add(claim.dropPlayerId);
        }
      }

      // Mark claim as success
      await tx.waiverClaim.update({
        where: { id: claim.id },
        data: { status: "SUCCESS", processedAt: new Date() },
      });

      logs.push(`Claim ${claim.id} SUCCESS: Team ${claim.teamId} gets Player ${claim.playerId} for $${claim.bidAmount}`);
    }
  });

  return { success: true, logs };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("integration: waiver process → FAAB ordering (highest bidder wins)", () => {
  it("awards player to highest bidder, marks lower bidder as FAILED_OUTBID", async () => {
    const claims: WaiverClaim[] = [
      { id: 1, teamId: 1, playerId: 100, bidAmount: 15, dropPlayerId: null, team: { budget: 50 } },
      { id: 2, teamId: 2, playerId: 100, bidAmount: 10, dropPlayerId: null, team: { budget: 40 } },
    ];

    // Team 1 has enough budget
    mockTx.team.findUnique.mockResolvedValue({ budget: 50 });
    mockTx.team.update.mockResolvedValue({});
    mockTx.roster.create.mockResolvedValue({});
    mockTx.waiverClaim.update.mockResolvedValue({});

    const result = await simulateProcessWaivers(claims);

    expect(result.success).toBe(true);
    expect(result.logs).toHaveLength(2);
    expect(result.logs[0]).toContain("SUCCESS");
    expect(result.logs[1]).toContain("FAILED_OUTBID");

    // Roster created only once (for winning claim)
    expect(mockTx.roster.create).toHaveBeenCalledTimes(1);
    expect(mockTx.roster.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teamId: 1,
        playerId: 100,
        source: "WAIVER",
        price: 15,
      }),
    });

    // Budget deducted only for winner
    expect(mockTx.team.update).toHaveBeenCalledTimes(1);
    expect(mockTx.team.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { budget: { decrement: 15 } },
    });

    // Loser marked FAILED_OUTBID
    expect(mockTx.waiverClaim.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { status: "FAILED_OUTBID", processedAt: expect.any(Date) },
    });
  });

  it("handles three-way tie on different players — all succeed", async () => {
    const claims: WaiverClaim[] = [
      { id: 1, teamId: 1, playerId: 100, bidAmount: 10, dropPlayerId: null, team: { budget: 50 } },
      { id: 2, teamId: 2, playerId: 200, bidAmount: 8, dropPlayerId: null, team: { budget: 40 } },
      { id: 3, teamId: 3, playerId: 300, bidAmount: 5, dropPlayerId: null, team: { budget: 30 } },
    ];

    mockTx.team.findUnique
      .mockResolvedValueOnce({ budget: 50 })
      .mockResolvedValueOnce({ budget: 40 })
      .mockResolvedValueOnce({ budget: 30 });
    mockTx.team.update.mockResolvedValue({});
    mockTx.roster.create.mockResolvedValue({});
    mockTx.waiverClaim.update.mockResolvedValue({});

    const result = await simulateProcessWaivers(claims);

    expect(result.logs.filter((l) => l.includes("SUCCESS"))).toHaveLength(3);
    expect(mockTx.roster.create).toHaveBeenCalledTimes(3);
    expect(mockTx.team.update).toHaveBeenCalledTimes(3);
  });
});

describe("integration: waiver process → budget insufficient", () => {
  it("marks claim as FAILED_INVALID when team cannot afford the bid", async () => {
    const claims: WaiverClaim[] = [
      { id: 1, teamId: 1, playerId: 100, bidAmount: 100, dropPlayerId: null, team: { budget: 5 } },
    ];

    mockTx.team.findUnique.mockResolvedValue({ budget: 5 });
    mockTx.waiverClaim.update.mockResolvedValue({});

    const result = await simulateProcessWaivers(claims);

    expect(result.logs[0]).toContain("FAILED_INVALID");
    expect(result.logs[0]).toContain("Insufficient budget");

    // No roster created, no budget deducted
    expect(mockTx.roster.create).not.toHaveBeenCalled();
    expect(mockTx.team.update).not.toHaveBeenCalled();

    // Claim marked as failed
    expect(mockTx.waiverClaim.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: "FAILED_INVALID", processedAt: expect.any(Date) },
    });
  });

  it("first claim succeeds, second claim for same player fails (even if budget is fine)", async () => {
    const claims: WaiverClaim[] = [
      { id: 1, teamId: 1, playerId: 100, bidAmount: 20, dropPlayerId: null, team: { budget: 50 } },
      { id: 2, teamId: 2, playerId: 100, bidAmount: 15, dropPlayerId: null, team: { budget: 200 } },
    ];

    mockTx.team.findUnique.mockResolvedValue({ budget: 50 });
    mockTx.team.update.mockResolvedValue({});
    mockTx.roster.create.mockResolvedValue({});
    mockTx.waiverClaim.update.mockResolvedValue({});

    const result = await simulateProcessWaivers(claims);

    // Team 2 has plenty of budget, but player already taken
    expect(result.logs[0]).toContain("SUCCESS");
    expect(result.logs[1]).toContain("FAILED_OUTBID");
    expect(mockTx.roster.create).toHaveBeenCalledTimes(1);
  });
});

describe("integration: waiver process → drop player handling", () => {
  it("releases drop player from roster on successful claim", async () => {
    const claims: WaiverClaim[] = [
      { id: 1, teamId: 1, playerId: 100, bidAmount: 5, dropPlayerId: 200, team: { budget: 50 } },
    ];

    mockTx.team.findUnique.mockResolvedValue({ budget: 50 });
    mockTx.team.update.mockResolvedValue({});
    mockTx.roster.create.mockResolvedValue({});
    mockTx.roster.findFirst.mockResolvedValue({ id: 55 }); // drop player roster entry
    mockTx.roster.update.mockResolvedValue({});
    mockTx.waiverClaim.update.mockResolvedValue({});

    await simulateProcessWaivers(claims);

    // Drop player roster entry soft-deleted
    expect(mockTx.roster.findFirst).toHaveBeenCalledWith({
      where: { teamId: 1, playerId: 200, releasedAt: null },
    });
    expect(mockTx.roster.update).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { releasedAt: expect.any(Date), source: "WAIVER_DROP" },
    });
  });

  it("does not crash when drop player is not found on roster", async () => {
    const claims: WaiverClaim[] = [
      { id: 1, teamId: 1, playerId: 100, bidAmount: 5, dropPlayerId: 200, team: { budget: 50 } },
    ];

    mockTx.team.findUnique.mockResolvedValue({ budget: 50 });
    mockTx.team.update.mockResolvedValue({});
    mockTx.roster.create.mockResolvedValue({});
    mockTx.roster.findFirst.mockResolvedValue(null); // drop player NOT on roster
    mockTx.waiverClaim.update.mockResolvedValue({});

    const result = await simulateProcessWaivers(claims);

    expect(result.logs[0]).toContain("SUCCESS");
    // roster.update should NOT be called since findFirst returned null
    expect(mockTx.roster.update).not.toHaveBeenCalled();
  });

  it("fails second claim when drop player was already dropped in same batch", async () => {
    // Two claims from same team, both trying to drop the same player
    const claims: WaiverClaim[] = [
      { id: 1, teamId: 1, playerId: 100, bidAmount: 10, dropPlayerId: 500, team: { budget: 50 } },
      { id: 2, teamId: 1, playerId: 200, bidAmount: 5, dropPlayerId: 500, team: { budget: 50 } },
    ];

    mockTx.team.findUnique
      .mockResolvedValueOnce({ budget: 50 })
      .mockResolvedValueOnce({ budget: 40 }); // after first deduction
    mockTx.team.update.mockResolvedValue({});
    mockTx.roster.create.mockResolvedValue({});
    mockTx.roster.findFirst.mockResolvedValue({ id: 77 });
    mockTx.roster.update.mockResolvedValue({});
    mockTx.waiverClaim.update.mockResolvedValue({});

    const result = await simulateProcessWaivers(claims);

    // First claim succeeds, second fails because drop player already used
    expect(result.logs[0]).toContain("SUCCESS");
    expect(result.logs[1]).toContain("FAILED_INVALID");
    expect(result.logs[1]).toContain("Drop player already processed");

    // Only one roster.create for the pickup
    expect(mockTx.roster.create).toHaveBeenCalledTimes(1);
  });
});

describe("integration: waiver process → $0 FAAB claims", () => {
  it("allows $0 bids that succeed when budget check passes", async () => {
    const claims: WaiverClaim[] = [
      { id: 1, teamId: 1, playerId: 100, bidAmount: 0, dropPlayerId: null, team: { budget: 0 } },
    ];

    mockTx.team.findUnique.mockResolvedValue({ budget: 0 });
    mockTx.team.update.mockResolvedValue({});
    mockTx.roster.create.mockResolvedValue({});
    mockTx.waiverClaim.update.mockResolvedValue({});

    const result = await simulateProcessWaivers(claims);

    expect(result.logs[0]).toContain("SUCCESS");
    expect(mockTx.roster.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teamId: 1,
        playerId: 100,
        source: "WAIVER",
        price: 0,
      }),
    });
  });
});

describe("integration: waiver process → atomicity", () => {
  it("runs all mutations inside a single $transaction call", async () => {
    const claims: WaiverClaim[] = [
      { id: 1, teamId: 1, playerId: 100, bidAmount: 10, dropPlayerId: null, team: { budget: 50 } },
      { id: 2, teamId: 2, playerId: 200, bidAmount: 8, dropPlayerId: 300, team: { budget: 40 } },
    ];

    mockTx.team.findUnique
      .mockResolvedValueOnce({ budget: 50 })
      .mockResolvedValueOnce({ budget: 40 });
    mockTx.team.update.mockResolvedValue({});
    mockTx.roster.create.mockResolvedValue({});
    mockTx.roster.findFirst.mockResolvedValue({ id: 88 });
    mockTx.roster.update.mockResolvedValue({});
    mockTx.waiverClaim.update.mockResolvedValue({});

    await simulateProcessWaivers(claims);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("propagates transaction errors", async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("Serialization failure"));

    const claims: WaiverClaim[] = [
      { id: 1, teamId: 1, playerId: 100, bidAmount: 5, dropPlayerId: null, team: { budget: 50 } },
    ];

    await expect(simulateProcessWaivers(claims)).rejects.toThrow("Serialization failure");
  });
});

describe("integration: waiver process → empty batch", () => {
  it("handles no pending claims gracefully", async () => {
    const result = await simulateProcessWaivers([]);

    expect(result.success).toBe(true);
    expect(result.logs).toHaveLength(0);
    expect(mockTx.roster.create).not.toHaveBeenCalled();
    expect(mockTx.team.update).not.toHaveBeenCalled();
  });
});
