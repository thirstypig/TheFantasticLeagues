import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    aiInsight: { findMany: vi.fn() },
    trade: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../../db/prisma.js";
import { getInsightHistory, perSideTake } from "../services/aiInsightService.js";

const mockPrisma = prisma as unknown as {
  aiInsight: { findMany: ReturnType<typeof vi.fn> };
  trade: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  mockPrisma.aiInsight.findMany.mockReset();
  mockPrisma.trade.findMany.mockReset();
});

const mkInsight = (id: number, daysAgo: number, type = "weekly") => ({
  id,
  type,
  leagueId: 1,
  teamId: 10,
  weekKey: "2026-W01",
  data: { foo: "bar" },
  createdAt: new Date(Date.now() - daysAgo * 86_400_000),
  team: { id: 10, name: `Team ${id}` },
});

const mkTrade = (id: number, daysAgo: number) => ({
  id,
  leagueId: 1,
  proposerId: 5,
  status: "PROCESSED",
  createdAt: new Date(Date.now() - daysAgo * 86_400_000),
  expiresAt: null,
  processedAt: null,
  aiAnalysis: { verdict: "fair" },
  proposer: { id: 5, name: "Proposer" },
});

describe("aiInsightService", () => {
  describe("perSideTake", () => {
    it("returns ceil(limit/2) + 5 safety margin", () => {
      expect(perSideTake(30)).toBe(20);
      expect(perSideTake(100)).toBe(55);
      expect(perSideTake(1)).toBe(6);
      expect(perSideTake(10)).toBe(10);
    });
  });

  describe("getInsightHistory", () => {
    it("queries each side with ceil(limit/2) + 5 take", async () => {
      mockPrisma.aiInsight.findMany.mockResolvedValue([]);
      mockPrisma.trade.findMany.mockResolvedValue([]);

      await getInsightHistory(1, 30);

      expect(mockPrisma.aiInsight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20, where: { leagueId: 1 } }),
      );
      expect(mockPrisma.trade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });

    it("merges and slices to <= limit", async () => {
      mockPrisma.aiInsight.findMany.mockResolvedValue([
        mkInsight(1, 1),
        mkInsight(2, 3),
        mkInsight(3, 5),
      ]);
      mockPrisma.trade.findMany.mockResolvedValue([
        mkTrade(100, 0),
        mkTrade(101, 2),
        mkTrade(102, 4),
      ]);

      const result = await getInsightHistory(1, 4);

      expect(result.length).toBeLessThanOrEqual(4);
      expect(result.length).toBe(4);
      // newest first
      expect(result[0]!.id).toBe("trade-100");
      expect(result[1]!.id).toBe("insight-1");
      expect(result[2]!.id).toBe("trade-101");
      expect(result[3]!.id).toBe("insight-2");
    });

    it("tags rows with kind discriminant", async () => {
      mockPrisma.aiInsight.findMany.mockResolvedValue([mkInsight(1, 1, "league_digest")]);
      mockPrisma.trade.findMany.mockResolvedValue([mkTrade(99, 2)]);

      const result = await getInsightHistory(1, 10);

      const insightRow = result.find((r) => r.id === "insight-1");
      const tradeRow = result.find((r) => r.id === "trade-99");
      expect(insightRow?.kind).toBe("insight");
      expect(insightRow?.type).toBe("league_digest");
      expect(tradeRow?.kind).toBe("trade_analysis");
      expect(tradeRow?.type).toBe("processed_trade_analysis");
    });

    it("filters out trades without aiAnalysis", async () => {
      mockPrisma.aiInsight.findMany.mockResolvedValue([]);
      mockPrisma.trade.findMany.mockResolvedValue([
        { ...mkTrade(1, 0), aiAnalysis: null },
        mkTrade(2, 1),
      ]);

      const result = await getInsightHistory(1, 10);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("trade-2");
    });
  });
});
