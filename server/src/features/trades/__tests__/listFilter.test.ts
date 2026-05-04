import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────
//
// Targeted route-level test for the GET /api/trades query-param filter
// added in todo #167.1 — `?status=PROPOSED&limit=N`. Mounts the real
// router behind supertest with Prisma mocked so we can assert on the
// `findMany` `where` / `take` arguments.

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    trade: { findMany: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../lib/rosterGuard.js", () => ({ assertRosterLimit: vi.fn() }));
vi.mock("../../../lib/rosterWindow.js", () => ({
  resolveEffectiveDate: vi.fn(),
  assertNoOwnershipConflict: vi.fn(),
}));
vi.mock("../../../lib/utils.js", () => ({ getWeekKey: vi.fn(() => "2026-W18") }));
vi.mock("../../../lib/emailService.js", () => ({
  sendTradeProposedEmail: vi.fn(),
  sendTradeProcessedEmail: vi.fn(),
  sendTradeVetoedEmail: vi.fn(),
  notifyTeamOwners: vi.fn(),
}));
vi.mock("../../../lib/pushService.js", () => ({
  sendPushToTeamOwners: vi.fn(),
  sendPushToLeague: vi.fn(),
}));
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
vi.mock("../../../middleware/seasonGuard.js", () => ({
  requireSeasonStatus: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next),
}));

import express from "express";
import supertest from "supertest";
import { tradesRouter } from "../routes.js";
import { prisma } from "../../../db/prisma.js";

const mockPrisma = prisma as any;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: NextFunction) => {
    req.user = { id: 1, isAdmin: false, email: "u@test.com" };
    next();
  });
  app.use("/api/trades", tradesRouter);
  app.use((err: any, _req: any, res: any, _next: NextFunction) => {
    res.status(500).json({ error: "Internal Server Error", detail: err?.message });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.trade.findMany.mockResolvedValue([]);
});

describe("GET /api/trades — status + limit filters (todo #167.1)", () => {
  it("returns 400 when leagueId is missing", async () => {
    const res = await supertest(makeApp()).get("/api/trades");
    expect(res.status).toBe(400);
  });

  it("legacy behavior — no status / no limit returns full league history", async () => {
    await supertest(makeApp()).get("/api/trades?leagueId=20").expect(200);

    expect(mockPrisma.trade.findMany).toHaveBeenCalledTimes(1);
    const args = mockPrisma.trade.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ leagueId: 20 });
    // No `take` clause when limit is omitted — preserves existing
    // TradesPage / ActivityPage behavior that wants the full history.
    expect(args.take).toBeUndefined();
  });

  it("?status=PROPOSED narrows the where clause to that status", async () => {
    await supertest(makeApp())
      .get("/api/trades?leagueId=20&status=PROPOSED")
      .expect(200);

    const args = mockPrisma.trade.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ leagueId: 20, status: "PROPOSED" });
  });

  it("?limit=10 caps the result set via Prisma `take`", async () => {
    await supertest(makeApp())
      .get("/api/trades?leagueId=20&limit=10")
      .expect(200);

    const args = mockPrisma.trade.findMany.mock.calls[0][0];
    expect(args.take).toBe(10);
  });

  it("combined ?status=PROPOSED&limit=10 (Home page call site)", async () => {
    await supertest(makeApp())
      .get("/api/trades?leagueId=20&status=PROPOSED&limit=10")
      .expect(200);

    const args = mockPrisma.trade.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ leagueId: 20, status: "PROPOSED" });
    expect(args.take).toBe(10);
    expect(args.orderBy).toEqual({ createdAt: "desc" });
  });

  it("clamps `limit` above 100 to 100 (DoS guard)", async () => {
    await supertest(makeApp())
      .get("/api/trades?leagueId=20&limit=500")
      .expect(200);

    const args = mockPrisma.trade.findMany.mock.calls[0][0];
    expect(args.take).toBe(100);
  });

  it("ignores unknown status values (no filter applied)", async () => {
    await supertest(makeApp())
      .get("/api/trades?leagueId=20&status=BOGUS")
      .expect(200);

    const args = mockPrisma.trade.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ leagueId: 20 });
  });

  it("ignores non-numeric / non-positive `limit` values", async () => {
    await supertest(makeApp())
      .get("/api/trades?leagueId=20&limit=abc")
      .expect(200);

    let args = mockPrisma.trade.findMany.mock.calls[0][0];
    expect(args.take).toBeUndefined();

    mockPrisma.trade.findMany.mockClear();
    await supertest(makeApp())
      .get("/api/trades?leagueId=20&limit=0")
      .expect(200);

    args = mockPrisma.trade.findMany.mock.calls[0][0];
    expect(args.take).toBeUndefined();
  });

  it("status param is case-insensitive (proposed → PROPOSED)", async () => {
    await supertest(makeApp())
      .get("/api/trades?leagueId=20&status=proposed")
      .expect(200);

    const args = mockPrisma.trade.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ leagueId: 20, status: "PROPOSED" });
  });
});
