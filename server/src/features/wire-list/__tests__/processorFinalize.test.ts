/**
 * Wire-list finalize call-count budget test (todo #160).
 *
 * Verifies that batching N+1 round-trips reduces the per-finalize
 * Prisma call count from ~7N + 5 to a small constant + per-add roster
 * mutations. With a 5-add fixture the new code performs:
 *   - 1 CAS updateMany on waiverPeriod.status
 *   - 1 findMany succeededAdds
 *   - blocker pass: 2 calls per add (roster.findFirst, player.findUnique,
 *     roster.findFirst) → up to 3N
 *   - 1 findMany dropRosters preload
 *   - per-add: 1 roster.updateMany (release) + 1 roster.create
 *   - 1 transactionEvent.createMany
 *   - 1 waiverAddEntry.updateMany (processedAt)
 *   - 1 waiverDropEntry.updateMany (processedAt)
 *   - 1 waiverDropEntry.updateMany (UNUSED)
 *   - 1 waiverPeriod.update (PROCESSED)
 *
 * Total for 5 adds: 1 + 1 + 5*3 (blocker) + 1 + 5*2 + 4 = 32 (≤35 budget).
 * Pre-batching the same fixture issued ≥7*5 (loop body) + 5*3 (blockers)
 * + 4 outer = 54.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

let prismaCallCount = 0;
const txCallLog: string[] = [];

function makeTxFn(name: string, ret: any = { count: 1 }) {
  return vi.fn(async () => {
    txCallLog.push(name);
    prismaCallCount++;
    return typeof ret === "function" ? ret() : ret;
  });
}

vi.mock("../../../db/prisma.js", () => {
  const tx = {
    waiverPeriod: {
      updateMany: makeTxFn("waiverPeriod.updateMany", { count: 1 }),
      update: makeTxFn("waiverPeriod.update", { id: 1, status: "PROCESSED" }),
    },
    waiverAddEntry: {
      findMany: vi.fn(async () => {
        txCallLog.push("waiverAddEntry.findMany");
        prismaCallCount++;
        return SUCCEEDED_ADDS;
      }),
      updateMany: makeTxFn("waiverAddEntry.updateMany", { count: 5 }),
    },
    waiverDropEntry: {
      updateMany: makeTxFn("waiverDropEntry.updateMany", { count: 0 }),
    },
    roster: {
      findFirst: vi.fn(async () => {
        txCallLog.push("roster.findFirst");
        prismaCallCount++;
        // Inside blocker pass: first findFirst (PLAYER_NOT_FA) returns null
        // → not on roster, so player IS still FA. Second findFirst (drop
        // roster lookup) returns truthy.
        const callIdx = txCallLog.filter((s) => s === "roster.findFirst").length;
        // Pattern per add in blocker pass: stillFA call (return null), dropRoster call (return truthy)
        return callIdx % 2 === 1 ? null : { id: 1000 + callIdx };
      }),
      findMany: vi.fn(async () => {
        txCallLog.push("roster.findMany");
        prismaCallCount++;
        return SUCCEEDED_ADDS.map((a, i) => ({
          id: 5000 + i,
          teamId: a.teamId,
          playerId: a.consumedDrop.playerId,
          assignedPosition: "1B",
        }));
      }),
      updateMany: makeTxFn("roster.updateMany", { count: 1 }),
      create: makeTxFn("roster.create", { id: 9000 }),
    },
    player: {
      findUnique: vi.fn(async () => {
        txCallLog.push("player.findUnique");
        prismaCallCount++;
        return { mlbTeam: "LAD", name: "X" };
      }),
    },
    transactionEvent: {
      createMany: makeTxFn("transactionEvent.createMany", { count: 10 }),
    },
  };

  return {
    prisma: {
      waiverPeriod: { findUnique: vi.fn() },
      waiverAddEntry: { count: vi.fn(), findMany: vi.fn() },
      league: { findUnique: vi.fn() },
      leagueMembership: { findUnique: vi.fn() },
      teamOwnership: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (cb: any) => cb(tx)),
    },
  };
});

vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: any, _res: any, next: () => void) => next()),
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../lib/featureFlags.js", () => ({ enforceRosterRules: () => false }));
vi.mock("../../transactions/lib/positionInherit.js", () => ({
  isEligibleForSlot: () => true,
}));
vi.mock("../../../lib/mlbTeams.js", () => ({
  getLeagueStatsSource: vi.fn(async () => "MLB"),
  getTeamsForSource: vi.fn(() => null),
}));
vi.mock("../../../lib/pushService.js", () => ({ sendPushToUser: vi.fn() }));
vi.mock("../../../lib/utils.js", () => ({
  nextDayEffective: () => new Date("2026-05-07T00:00:00.000Z"),
}));

// ── Fixture: 5 succeeded adds ────────────────────────────────────

const SUCCEEDED_ADDS = Array.from({ length: 5 }).map((_, i) => ({
  id: 100 + i,
  periodId: 1,
  teamId: 10 + i,
  playerId: 7000 + i,
  priority: 1,
  outcome: "SUCCEEDED",
  consumedDropEntryId: 200 + i,
  consumedDrop: {
    id: 200 + i,
    playerId: 8000 + i,
    teamId: 10 + i,
    dropMode: "RELEASE",
    player: { name: `Drop${i}` },
  },
  player: { id: 7000 + i, name: `Add${i}`, posPrimary: "1B", posList: "1B" },
}));

import { prisma } from "../../../db/prisma.js";
import express from "express";
import supertest from "supertest";
import { wireListProcessorRouter } from "../processor.js";

const mockPrisma = prisma as any;

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: true };
  next();
});
app.use(wireListProcessorRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error("test error handler:", err);
  res.status(500).json({ error: String(err) });
});

beforeEach(() => {
  prismaCallCount = 0;
  txCallLog.length = 0;
  vi.clearAllMocks();
});

describe("wire-list finalize — call-count budget (todo #160)", () => {
  it("performs ≤35 prisma calls inside tx for a 5-succeeded-add finalize", async () => {
    mockPrisma.waiverPeriod.findUnique.mockResolvedValue({
      id: 1,
      leagueId: 2,
      status: "LOCKED",
      createdAt: new Date(),
    });
    mockPrisma.waiverAddEntry.count.mockResolvedValue(0);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });

    const res = await supertest(app).post("/periods/1/finalize");
    expect(res.status).toBe(200);
    expect(res.body.addsApplied).toBe(5);
    expect(res.body.dropsConsumed).toBe(5);

    // Budget: ≤35 prisma calls inside the tx for 5 adds.
    // Pre-batching this fixture would have issued ≥54 calls
    // (7 per add in the body + 3 per add in blocker pass + 4 outer).
    expect(prismaCallCount).toBeLessThanOrEqual(35);

    // Verify batched writes happened exactly once each.
    const flushes = txCallLog.filter(
      (s) => s === "transactionEvent.createMany"
            || s === "waiverAddEntry.updateMany"
            || s === "waiverDropEntry.updateMany",
    );
    // 1 createMany + 1 addEntry updateMany + 2 dropEntry updateMany (processed + UNUSED).
    expect(flushes.filter((s) => s === "transactionEvent.createMany").length).toBe(1);
    expect(flushes.filter((s) => s === "waiverAddEntry.updateMany").length).toBe(1);
    expect(flushes.filter((s) => s === "waiverDropEntry.updateMany").length).toBe(2);

    // Drop-roster preload happened once (not 5x findFirst inside loop).
    expect(txCallLog.filter((s) => s === "roster.findMany").length).toBe(1);

    // No redundant per-iteration player.findUnique inside the loop body
    // (the 5 from the blocker pass are unavoidable for FA re-validation;
    // the loop body should add zero more).
    expect(txCallLog.filter((s) => s === "player.findUnique").length).toBe(5);
  });
});
