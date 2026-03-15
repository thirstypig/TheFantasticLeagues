import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    auctionSession: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { saveState, loadState, clearState } from "../services/auctionPersistence.js";
import { prisma } from "../../../db/prisma.js";
import type { AuctionState } from "../routes.js";

const mockPrisma = prisma as any;

function makeState(leagueId: number): AuctionState {
  return {
    leagueId,
    status: "nominating",
    nomination: null,
    teams: [],
    queue: [1, 2],
    queueIndex: 0,
    config: { bidTimer: 15, nominationTimer: 30, budgetCap: 400, rosterSize: 23, pitcherCount: 9, batterCount: 14, positionLimits: null },
    log: [],
    lastUpdate: Date.now(),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("auctionPersistence", () => {
  describe("saveState", () => {
    it("upserts state to DB", async () => {
      mockPrisma.auctionSession.upsert.mockResolvedValue({});
      const state = makeState(1);
      await saveState(1, state);

      expect(mockPrisma.auctionSession.upsert).toHaveBeenCalledWith({
        where: { leagueId: 1 },
        create: { leagueId: 1, state: state as any },
        update: { state: state as any },
      });
    });

    it("logs error but does not throw on DB failure", async () => {
      mockPrisma.auctionSession.upsert.mockRejectedValue(new Error("DB down"));
      await expect(saveState(1, makeState(1))).resolves.toBeUndefined();
    });
  });

  describe("loadState", () => {
    it("returns state from DB", async () => {
      const state = makeState(1);
      mockPrisma.auctionSession.findUnique.mockResolvedValue({ leagueId: 1, state });
      const result = await loadState(1);
      expect(result).toEqual(state);
    });

    it("returns null when no session exists", async () => {
      mockPrisma.auctionSession.findUnique.mockResolvedValue(null);
      const result = await loadState(99);
      expect(result).toBeNull();
    });

    it("returns null on DB error", async () => {
      mockPrisma.auctionSession.findUnique.mockRejectedValue(new Error("DB down"));
      const result = await loadState(1);
      expect(result).toBeNull();
    });
  });

  describe("clearState", () => {
    it("deletes session from DB", async () => {
      mockPrisma.auctionSession.deleteMany.mockResolvedValue({ count: 1 });
      await clearState(1);
      expect(mockPrisma.auctionSession.deleteMany).toHaveBeenCalledWith({ where: { leagueId: 1 } });
    });

    it("logs error but does not throw on failure", async () => {
      mockPrisma.auctionSession.deleteMany.mockRejectedValue(new Error("DB down"));
      await expect(clearState(1)).resolves.toBeUndefined();
    });
  });

  describe("round-trip", () => {
    it("save then load returns equivalent state", async () => {
      const state = makeState(1);
      state.queue = [1, 2, 3];
      state.queueIndex = 2;
      state.status = "bidding";

      mockPrisma.auctionSession.upsert.mockResolvedValue({});
      await saveState(1, state);

      mockPrisma.auctionSession.findUnique.mockResolvedValue({ leagueId: 1, state });
      const loaded = await loadState(1);

      expect(loaded).toEqual(state);
      expect(loaded?.queue).toEqual([1, 2, 3]);
      expect(loaded?.queueIndex).toBe(2);
    });
  });
});
