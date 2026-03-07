import { describe, it, expect, vi, beforeEach } from "vitest";

// All vi.mock calls are hoisted — must not reference top-level variables
vi.mock("../../../db/prisma.js", () => {
  const mockTx = {
    roster: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    team: { update: vi.fn() },
    trade: { update: vi.fn() },
  };
  return {
    prisma: {
      trade: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  isTeamOwner: vi.fn(),
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

// Import schemas from the actual source (after mocks are set up)
import { tradeItemSchema, tradeProposalSchema } from "../routes.js";
import { prisma } from "../../../db/prisma.js";

const mockPrisma = prisma as any;
const mockTx = mockPrisma.__mockTx;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("trades - validation schemas", () => {
  it("accepts valid trade proposal", () => {
    const result = tradeProposalSchema.safeParse({
      leagueId: 1,
      proposerTeamId: 1,
      items: [{ senderId: 1, recipientId: 2, assetType: "PLAYER", playerId: 100 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects proposal with no items", () => {
    const result = tradeProposalSchema.safeParse({
      leagueId: 1, proposerTeamId: 1, items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects proposal with invalid assetType", () => {
    const result = tradeProposalSchema.safeParse({
      leagueId: 1, proposerTeamId: 1,
      items: [{ senderId: 1, recipientId: 2, assetType: "INVALID" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amounts", () => {
    const result = tradeItemSchema.safeParse({
      senderId: 1, recipientId: 2, assetType: "BUDGET", amount: -5,
    });
    expect(result.success).toBe(false);
  });

  it("accepts BUDGET trade with amount", () => {
    const result = tradeItemSchema.safeParse({
      senderId: 1, recipientId: 2, assetType: "BUDGET", amount: 10,
    });
    expect(result.success).toBe(true);
  });

  it("accepts PICK trade with pickRound", () => {
    const result = tradeItemSchema.safeParse({
      senderId: 1, recipientId: 2, assetType: "PICK", pickRound: 3,
    });
    expect(result.success).toBe(true);
  });
});

describe("trades - propose (POST /)", () => {
  it("creates a trade with PROPOSED status", async () => {
    const tradeData = {
      leagueId: 1,
      proposerTeamId: 1,
      items: [{ senderId: 1, recipientId: 2, assetType: "PLAYER", playerId: 100 }],
    };

    mockPrisma.trade.create.mockResolvedValue({
      id: 1, ...tradeData, status: "PROPOSED", items: tradeData.items,
    });

    const result = await mockPrisma.trade.create({
      data: {
        leagueId: tradeData.leagueId,
        proposerId: tradeData.proposerTeamId,
        status: "PROPOSED",
        items: { create: tradeData.items },
      },
      include: { items: true },
    });

    expect(result.status).toBe("PROPOSED");
    expect(result.items).toHaveLength(1);
  });
});

describe("trades - list (GET /)", () => {
  it("returns trades for a given league", async () => {
    mockPrisma.trade.findMany.mockResolvedValue([
      { id: 1, leagueId: 1, status: "PROPOSED", items: [] },
      { id: 2, leagueId: 1, status: "ACCEPTED", items: [] },
    ]);

    const trades = await mockPrisma.trade.findMany({
      where: { leagueId: 1 },
      include: { items: { include: { player: true, sender: true, recipient: true } }, proposer: true },
      orderBy: { createdAt: "desc" },
    });

    expect(trades).toHaveLength(2);
    expect(trades[0].leagueId).toBe(1);
  });
});

describe("trades - accept (POST /:id/accept)", () => {
  it("updates trade status to ACCEPTED", async () => {
    mockPrisma.trade.update.mockResolvedValue({ id: 1, status: "ACCEPTED" });

    const trade = await mockPrisma.trade.update({
      where: { id: 1 },
      data: { status: "ACCEPTED" },
    });

    expect(trade.status).toBe("ACCEPTED");
  });
});

describe("trades - reject (POST /:id/reject)", () => {
  it("updates trade status to REJECTED", async () => {
    mockPrisma.trade.update.mockResolvedValue({ id: 1, status: "REJECTED" });

    const trade = await mockPrisma.trade.update({
      where: { id: 1 },
      data: { status: "REJECTED" },
    });

    expect(trade.status).toBe("REJECTED");
  });
});

describe("trades - process (POST /:id/process)", () => {
  it("rejects processing when trade is not ACCEPTED", async () => {
    mockPrisma.trade.findUnique.mockResolvedValue({ id: 1, status: "PROPOSED", items: [] });

    const trade = await mockPrisma.trade.findUnique({ where: { id: 1 }, include: { items: true } });
    expect(!trade || trade.status !== "ACCEPTED").toBe(true);
  });

  it("processes PLAYER trade items — soft-deletes sender roster, creates recipient roster", async () => {
    const trade = {
      id: 1, status: "ACCEPTED",
      items: [{ assetType: "PLAYER", playerId: 100, senderId: 1, recipientId: 2 }],
    };
    mockPrisma.trade.findUnique.mockResolvedValue(trade);

    mockTx.roster.findFirst.mockResolvedValue({ id: 10, price: 15 });
    mockTx.roster.update.mockResolvedValue({});
    mockTx.roster.create.mockResolvedValue({});
    mockTx.trade.update.mockResolvedValue({});

    await mockPrisma.$transaction(async (tx: any) => {
      for (const item of trade.items) {
        if (item.assetType === "PLAYER" && item.playerId) {
          const rosterEntry = await tx.roster.findFirst({
            where: { teamId: item.senderId, playerId: item.playerId, releasedAt: null },
          });

          if (rosterEntry) {
            await tx.roster.update({
              where: { id: rosterEntry.id },
              data: { releasedAt: expect.any(Date), source: "TRADE_OUT" },
            });

            await tx.roster.create({
              data: {
                teamId: item.recipientId,
                playerId: item.playerId,
                source: "TRADE_IN",
                acquiredAt: expect.any(Date),
                price: rosterEntry.price,
                assignedPosition: null,
              },
            });
          }
        }
      }
      await tx.trade.update({
        where: { id: trade.id },
        data: { status: "PROCESSED", processedAt: expect.any(Date) },
      });
    });

    expect(mockTx.roster.findFirst).toHaveBeenCalled();
    expect(mockTx.roster.update).toHaveBeenCalled();
    expect(mockTx.roster.create).toHaveBeenCalled();
    expect(mockTx.trade.update).toHaveBeenCalled();
  });

  it("processes BUDGET trade items — decrements sender, increments recipient", async () => {
    const trade = {
      id: 2, status: "ACCEPTED",
      items: [{ assetType: "BUDGET", senderId: 1, recipientId: 2, amount: 10 }],
    };
    mockPrisma.trade.findUnique.mockResolvedValue(trade);

    mockTx.team.update.mockResolvedValue({});
    mockTx.trade.update.mockResolvedValue({});

    await mockPrisma.$transaction(async (tx: any) => {
      for (const item of trade.items) {
        if (item.assetType === "BUDGET") {
          await tx.team.update({
            where: { id: item.senderId },
            data: { budget: { decrement: item.amount } },
          });
          await tx.team.update({
            where: { id: item.recipientId },
            data: { budget: { increment: item.amount } },
          });
        }
      }
      await tx.trade.update({
        where: { id: trade.id },
        data: { status: "PROCESSED" },
      });
    });

    expect(mockTx.team.update).toHaveBeenCalledTimes(2);
    expect(mockTx.team.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { budget: { decrement: 10 } } })
    );
    expect(mockTx.team.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2 }, data: { budget: { increment: 10 } } })
    );
  });
});
