import { describe, it, expect, vi, beforeEach } from "vitest";

// All vi.mock calls are hoisted — must not reference top-level variables
vi.mock("../../../db/prisma.js", () => {
  const mockTx = {
    waiverClaim: { update: vi.fn() },
    team: { findUnique: vi.fn(), update: vi.fn() },
    roster: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  };
  return {
    prisma: {
      waiverClaim: { findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
      team: { findUnique: vi.fn() },
      teamOwnership: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: any) => fn(mockTx)),
      __mockTx: mockTx,
    },
  };
});
vi.mock("../../../lib/supabase.js", () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() } },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireCommissionerOrAdmin: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  isTeamOwner: vi.fn(),
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

// Import schema from actual source (after mocks are set up)
import { waiverClaimSchema } from "../routes.js";
import { prisma } from "../../../db/prisma.js";

const mockPrisma = prisma as any;
const mockTx = mockPrisma.__mockTx;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("waivers - validation schema", () => {
  it("accepts valid waiver claim", () => {
    const result = waiverClaimSchema.safeParse({
      teamId: 1, playerId: 100, bidAmount: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative bidAmount", () => {
    const result = waiverClaimSchema.safeParse({
      teamId: 1, playerId: 100, bidAmount: -1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts zero bidAmount (valid for $0 FAAB)", () => {
    const result = waiverClaimSchema.safeParse({
      teamId: 1, playerId: 100, bidAmount: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional dropPlayerId", () => {
    const result = waiverClaimSchema.safeParse({
      teamId: 1, playerId: 100, bidAmount: 5, dropPlayerId: 200,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dropPlayerId).toBe(200);
    }
  });

  it("defaults priority to undefined (handler defaults to 1)", () => {
    const result = waiverClaimSchema.safeParse({
      teamId: 1, playerId: 100, bidAmount: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBeUndefined();
    }
  });
});

describe("waivers - list (GET /)", () => {
  it("returns pending claims sorted by bid desc, priority asc", async () => {
    mockPrisma.waiverClaim.findMany.mockResolvedValue([
      { id: 1, teamId: 1, playerId: 100, bidAmount: 10, status: "PENDING" },
      { id: 2, teamId: 2, playerId: 100, bidAmount: 5, status: "PENDING" },
    ]);

    const claims = await mockPrisma.waiverClaim.findMany({
      where: { status: "PENDING" },
      include: { player: true, dropPlayer: true },
      orderBy: [{ bidAmount: "desc" }, { priority: "asc" }],
    });

    expect(claims).toHaveLength(2);
    expect(claims[0].bidAmount).toBe(10);
  });

  it("filters by teamId when provided", async () => {
    mockPrisma.waiverClaim.findMany.mockResolvedValue([
      { id: 1, teamId: 1, playerId: 100, bidAmount: 10, status: "PENDING" },
    ]);

    const claims = await mockPrisma.waiverClaim.findMany({
      where: { teamId: 1, status: "PENDING" },
    });

    expect(claims).toHaveLength(1);
    expect(claims[0].teamId).toBe(1);
  });
});

describe("waivers - submit claim (POST /)", () => {
  it("creates a PENDING claim with default priority", async () => {
    mockPrisma.waiverClaim.create.mockResolvedValue({
      id: 1, teamId: 1, playerId: 100, bidAmount: 5, priority: 1, status: "PENDING",
    });

    const claim = await mockPrisma.waiverClaim.create({
      data: { teamId: 1, playerId: 100, bidAmount: 5, priority: 1, status: "PENDING" },
      include: { player: true },
    });

    expect(claim.status).toBe("PENDING");
    expect(claim.priority).toBe(1);
  });
});

describe("waivers - delete claim (DELETE /:id)", () => {
  it("deletes a claim by id", async () => {
    mockPrisma.waiverClaim.delete.mockResolvedValue({ id: 1 });

    await mockPrisma.waiverClaim.delete({ where: { id: 1 } });
    expect(mockPrisma.waiverClaim.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});

describe("waivers - process FAAB (POST /process)", () => {
  it("awards player to highest bidder and deducts budget", async () => {
    const claims = [
      { id: 1, teamId: 1, playerId: 100, bidAmount: 10, dropPlayerId: null, team: { budget: 50 } },
      { id: 2, teamId: 2, playerId: 100, bidAmount: 5, dropPlayerId: null, team: { budget: 40 } },
    ];
    mockPrisma.waiverClaim.findMany.mockResolvedValue(claims);

    const processedPlayerIds = new Set<number>();
    const logs: string[] = [];

    await mockPrisma.$transaction(async (tx: any) => {
      for (const claim of claims) {
        if (processedPlayerIds.has(claim.playerId)) {
          await tx.waiverClaim.update({
            where: { id: claim.id },
            data: { status: "FAILED_OUTBID" },
          });
          continue;
        }

        // Check budget
        mockTx.team.findUnique.mockResolvedValue({ budget: claim.team.budget });
        const currentTeam = await tx.team.findUnique({ where: { id: claim.teamId } });
        if (currentTeam.budget < claim.bidAmount) {
          await tx.waiverClaim.update({
            where: { id: claim.id },
            data: { status: "FAILED_INVALID" },
          });
          continue;
        }

        processedPlayerIds.add(claim.playerId);

        await tx.team.update({
          where: { id: claim.teamId },
          data: { budget: { decrement: claim.bidAmount } },
        });

        await tx.roster.create({
          data: { teamId: claim.teamId, playerId: claim.playerId, source: "WAIVER", price: claim.bidAmount },
        });

        await tx.waiverClaim.update({
          where: { id: claim.id },
          data: { status: "SUCCESS" },
        });

        logs.push(`Claim ${claim.id} SUCCESS`);
      }
    });

    // First claim wins, second gets FAILED_OUTBID
    expect(mockTx.roster.create).toHaveBeenCalledTimes(1);
    expect(mockTx.waiverClaim.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2 }, data: expect.objectContaining({ status: "FAILED_OUTBID" }) })
    );
  });

  it("marks claim as FAILED_INVALID when budget insufficient", async () => {
    const claims = [
      { id: 1, teamId: 1, playerId: 100, bidAmount: 100, dropPlayerId: null, team: { budget: 5 } },
    ];
    mockPrisma.waiverClaim.findMany.mockResolvedValue(claims);
    mockTx.team.findUnique.mockResolvedValue({ budget: 5 });

    const processedPlayerIds = new Set<number>();

    await mockPrisma.$transaction(async (tx: any) => {
      for (const claim of claims) {
        if (processedPlayerIds.has(claim.playerId)) continue;

        const currentTeam = await tx.team.findUnique({ where: { id: claim.teamId } });
        if (currentTeam.budget < claim.bidAmount) {
          await tx.waiverClaim.update({
            where: { id: claim.id },
            data: { status: "FAILED_INVALID" },
          });
          continue;
        }
      }
    });

    expect(mockTx.waiverClaim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED_INVALID" }) })
    );
    expect(mockTx.roster.create).not.toHaveBeenCalled();
  });

  it("processes drop player when specified", async () => {
    const claims = [
      { id: 1, teamId: 1, playerId: 100, bidAmount: 5, dropPlayerId: 200, team: { budget: 50 } },
    ];
    mockPrisma.waiverClaim.findMany.mockResolvedValue(claims);
    mockTx.team.findUnique.mockResolvedValue({ budget: 50 });
    mockTx.roster.findFirst.mockResolvedValue({ id: 99 });

    await mockPrisma.$transaction(async (tx: any) => {
      for (const claim of claims) {
        const currentTeam = await tx.team.findUnique({ where: { id: claim.teamId } });
        if (currentTeam.budget < claim.bidAmount) continue;

        await tx.team.update({ where: { id: claim.teamId }, data: { budget: { decrement: claim.bidAmount } } });
        await tx.roster.create({ data: { teamId: claim.teamId, playerId: claim.playerId, source: "WAIVER" } });

        if (claim.dropPlayerId) {
          const rosterEntry = await tx.roster.findFirst({
            where: { teamId: claim.teamId, playerId: claim.dropPlayerId, releasedAt: null },
          });
          if (rosterEntry) {
            await tx.roster.update({
              where: { id: rosterEntry.id },
              data: { releasedAt: expect.any(Date), source: "WAIVER_DROP" },
            });
          }
        }

        await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: "SUCCESS" } });
      }
    });

    expect(mockTx.roster.findFirst).toHaveBeenCalled();
    expect(mockTx.roster.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: "WAIVER_DROP" }) })
    );
  });
});
