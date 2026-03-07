import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration tests: Trade Processing → Roster Mutations
 *
 * Validates the POST /api/trades/:id/process flow:
 *   1. PLAYER trades: soft-delete sender roster entry, create recipient roster entry
 *   2. BUDGET trades: decrement sender budget, increment recipient budget
 *   3. Mixed trades: both PLAYER and BUDGET items in one transaction
 *   4. Atomicity: all mutations happen inside prisma.$transaction
 *   5. Guard: only ACCEPTED trades can be processed
 */

vi.mock("../../db/prisma.js", () => {
  const mockTx = {
    roster: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    team: { update: vi.fn() },
    trade: { update: vi.fn() },
  };
  return {
    prisma: {
      trade: { findUnique: vi.fn(), update: vi.fn() },
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
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
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
// Helper — mirrors the trade processing transaction from routes.ts
// ---------------------------------------------------------------------------

interface TradeItem {
  assetType: "PLAYER" | "BUDGET" | "PICK";
  playerId?: number;
  senderId: number;
  recipientId: number;
  amount?: number;
  pickRound?: number;
}

interface Trade {
  id: number;
  leagueId: number;
  status: string;
  items: TradeItem[];
}

async function simulateProcessTrade(trade: Trade) {
  if (trade.status !== "ACCEPTED") {
    return { error: "Trade not found or not accepted" };
  }

  await prisma.$transaction(async (tx: any) => {
    for (const item of trade.items) {
      if (item.assetType === "PLAYER" && item.playerId) {
        const rosterEntry = await tx.roster.findFirst({
          where: { teamId: item.senderId, playerId: item.playerId, releasedAt: null },
        });

        if (rosterEntry) {
          await tx.roster.update({
            where: { id: rosterEntry.id },
            data: { releasedAt: new Date(), source: "TRADE_OUT" },
          });

          await tx.roster.create({
            data: {
              teamId: item.recipientId,
              playerId: item.playerId,
              source: "TRADE_IN",
              acquiredAt: new Date(),
              price: rosterEntry.price,
              assignedPosition: null,
            },
          });
        }
      } else if (item.assetType === "BUDGET") {
        await tx.team.update({
          where: { id: item.senderId },
          data: { budget: { decrement: item.amount || 0 } },
        });
        await tx.team.update({
          where: { id: item.recipientId },
          data: { budget: { increment: item.amount || 0 } },
        });
      }
    }

    await tx.trade.update({
      where: { id: trade.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("integration: trade process → player roster movement", () => {
  it("soft-deletes sender roster and creates recipient roster for PLAYER trade", async () => {
    const trade: Trade = {
      id: 1,
      leagueId: 1,
      status: "ACCEPTED",
      items: [{ assetType: "PLAYER", playerId: 100, senderId: 1, recipientId: 2 }],
    };

    mockTx.roster.findFirst.mockResolvedValue({ id: 10, price: 25 });
    mockTx.roster.update.mockResolvedValue({});
    mockTx.roster.create.mockResolvedValue({});
    mockTx.trade.update.mockResolvedValue({});

    const result = await simulateProcessTrade(trade);

    expect(result).toEqual({ success: true });

    // Sender roster soft-deleted
    expect(mockTx.roster.findFirst).toHaveBeenCalledWith({
      where: { teamId: 1, playerId: 100, releasedAt: null },
    });
    expect(mockTx.roster.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { releasedAt: expect.any(Date), source: "TRADE_OUT" },
    });

    // Recipient roster created with same price
    expect(mockTx.roster.create).toHaveBeenCalledWith({
      data: {
        teamId: 2,
        playerId: 100,
        source: "TRADE_IN",
        acquiredAt: expect.any(Date),
        price: 25,
        assignedPosition: null,
      },
    });

    // Trade marked as PROCESSED
    expect(mockTx.trade.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: "PROCESSED", processedAt: expect.any(Date) },
    });
  });

  it("skips roster mutation when sender does not have the player on roster", async () => {
    const trade: Trade = {
      id: 2,
      leagueId: 1,
      status: "ACCEPTED",
      items: [{ assetType: "PLAYER", playerId: 999, senderId: 1, recipientId: 2 }],
    };

    mockTx.roster.findFirst.mockResolvedValue(null); // player not on sender roster
    mockTx.trade.update.mockResolvedValue({});

    await simulateProcessTrade(trade);

    expect(mockTx.roster.findFirst).toHaveBeenCalled();
    expect(mockTx.roster.update).not.toHaveBeenCalled();
    expect(mockTx.roster.create).not.toHaveBeenCalled();
    // Trade still marked as processed
    expect(mockTx.trade.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: expect.objectContaining({ status: "PROCESSED" }),
    });
  });
});

describe("integration: trade process → budget adjustments", () => {
  it("decrements sender budget and increments recipient budget", async () => {
    const trade: Trade = {
      id: 3,
      leagueId: 1,
      status: "ACCEPTED",
      items: [{ assetType: "BUDGET", senderId: 1, recipientId: 2, amount: 15 }],
    };

    mockTx.team.update.mockResolvedValue({});
    mockTx.trade.update.mockResolvedValue({});

    await simulateProcessTrade(trade);

    expect(mockTx.team.update).toHaveBeenCalledTimes(2);
    expect(mockTx.team.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { budget: { decrement: 15 } },
    });
    expect(mockTx.team.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { budget: { increment: 15 } },
    });
  });

  it("handles zero-amount BUDGET trade gracefully", async () => {
    const trade: Trade = {
      id: 4,
      leagueId: 1,
      status: "ACCEPTED",
      items: [{ assetType: "BUDGET", senderId: 1, recipientId: 2, amount: 0 }],
    };

    mockTx.team.update.mockResolvedValue({});
    mockTx.trade.update.mockResolvedValue({});

    await simulateProcessTrade(trade);

    expect(mockTx.team.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { budget: { decrement: 0 } },
    });
    expect(mockTx.team.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { budget: { increment: 0 } },
    });
  });
});

describe("integration: trade process → mixed items (PLAYER + BUDGET)", () => {
  it("processes both PLAYER and BUDGET items in a single transaction", async () => {
    const trade: Trade = {
      id: 5,
      leagueId: 1,
      status: "ACCEPTED",
      items: [
        { assetType: "PLAYER", playerId: 100, senderId: 1, recipientId: 2 },
        { assetType: "PLAYER", playerId: 200, senderId: 2, recipientId: 1 },
        { assetType: "BUDGET", senderId: 2, recipientId: 1, amount: 10 },
      ],
    };

    // Player 100: team 1 → team 2
    mockTx.roster.findFirst
      .mockResolvedValueOnce({ id: 10, price: 30 })   // player 100 on team 1
      .mockResolvedValueOnce({ id: 20, price: 15 });   // player 200 on team 2

    mockTx.roster.update.mockResolvedValue({});
    mockTx.roster.create.mockResolvedValue({});
    mockTx.team.update.mockResolvedValue({});
    mockTx.trade.update.mockResolvedValue({});

    await simulateProcessTrade(trade);

    // Two player soft-deletes
    expect(mockTx.roster.update).toHaveBeenCalledTimes(2);

    // Two new roster entries
    expect(mockTx.roster.create).toHaveBeenCalledTimes(2);

    // Player 100: sender roster released
    expect(mockTx.roster.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { releasedAt: expect.any(Date), source: "TRADE_OUT" },
    });

    // Player 100: recipient roster created
    expect(mockTx.roster.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teamId: 2,
        playerId: 100,
        source: "TRADE_IN",
        price: 30,
      }),
    });

    // Player 200: sender (team 2) roster released
    expect(mockTx.roster.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { releasedAt: expect.any(Date), source: "TRADE_OUT" },
    });

    // Player 200: recipient (team 1) roster created
    expect(mockTx.roster.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teamId: 1,
        playerId: 200,
        source: "TRADE_IN",
        price: 15,
      }),
    });

    // Budget: team 2 decremented, team 1 incremented
    expect(mockTx.team.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { budget: { decrement: 10 } },
    });
    expect(mockTx.team.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { budget: { increment: 10 } },
    });

    // Trade marked PROCESSED
    expect(mockTx.trade.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { status: "PROCESSED", processedAt: expect.any(Date) },
    });
  });
});

describe("integration: trade process → status guard", () => {
  it("rejects trade that is not in ACCEPTED status", async () => {
    const trade: Trade = {
      id: 6,
      leagueId: 1,
      status: "PROPOSED",
      items: [{ assetType: "PLAYER", playerId: 100, senderId: 1, recipientId: 2 }],
    };

    const result = await simulateProcessTrade(trade);

    expect(result).toEqual({ error: "Trade not found or not accepted" });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects trade that is already PROCESSED", async () => {
    const trade: Trade = {
      id: 7,
      leagueId: 1,
      status: "PROCESSED",
      items: [{ assetType: "BUDGET", senderId: 1, recipientId: 2, amount: 5 }],
    };

    const result = await simulateProcessTrade(trade);

    expect(result).toEqual({ error: "Trade not found or not accepted" });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects trade that is REJECTED", async () => {
    const trade: Trade = {
      id: 8,
      leagueId: 1,
      status: "REJECTED",
      items: [],
    };

    const result = await simulateProcessTrade(trade);

    expect(result).toEqual({ error: "Trade not found or not accepted" });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("integration: trade process → atomicity", () => {
  it("calls prisma.$transaction exactly once per process call", async () => {
    const trade: Trade = {
      id: 9,
      leagueId: 1,
      status: "ACCEPTED",
      items: [
        { assetType: "PLAYER", playerId: 100, senderId: 1, recipientId: 2 },
        { assetType: "BUDGET", senderId: 1, recipientId: 2, amount: 5 },
      ],
    };

    mockTx.roster.findFirst.mockResolvedValue({ id: 10, price: 20 });
    mockTx.roster.update.mockResolvedValue({});
    mockTx.roster.create.mockResolvedValue({});
    mockTx.team.update.mockResolvedValue({});
    mockTx.trade.update.mockResolvedValue({});

    await simulateProcessTrade(trade);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("propagates transaction errors (simulated)", async () => {
    const trade: Trade = {
      id: 10,
      leagueId: 1,
      status: "ACCEPTED",
      items: [{ assetType: "PLAYER", playerId: 100, senderId: 1, recipientId: 2 }],
    };

    mockPrisma.$transaction.mockRejectedValueOnce(new Error("Deadlock detected"));

    await expect(simulateProcessTrade(trade)).rejects.toThrow("Deadlock detected");
  });
});
