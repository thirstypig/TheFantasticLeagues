import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({ prisma: { leagueRule: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() } } }));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: (_q: unknown, _s: unknown, next: () => void) => next(),
  requireAdmin: (_q: unknown, _s: unknown, next: () => void) => next(),
  requireCommissionerOrAdmin: () => (_q: unknown, _s: unknown, next: () => void) => next(),
  requireLeagueMember: () => (_q: unknown, _s: unknown, next: () => void) => next(),
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import express from "express";
import supertest from "supertest";
import { rulesRouter } from "../rules-routes.js";
import { prisma } from "../../../db/prisma.js";
import { writeAuditLog } from "../../../lib/auditLog.js";

const m = prisma as any;

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: any) => { req.user = { id: 1, isAdmin: true }; next(); });
app.use("/api/leagues", rulesRouter);
app.use((_err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: "Internal Server Error" }));

const send = () => supertest(app).put("/api/leagues/20/rules").send({ updates: [{ id: 7, value: "maybe" }] });

beforeEach(() => {
  vi.clearAllMocks();
  m.leagueRule.findFirst.mockResolvedValue(null);
});

// The real CommissionerService runs; only prisma is mocked.
describe("PUT /api/leagues/:id/rules error mapping", () => {
  it("maps a locked rule to 403 with the message", async () => {
    m.leagueRule.findMany.mockResolvedValue([{ id: 7, category: "il", key: "il_slot_1_cost" }]);
    m.leagueRule.findFirst.mockResolvedValue({ id: 3, isLocked: true });
    const res = await send();
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Rules are locked for this season" });
    expect(m.leagueRule.update).not.toHaveBeenCalled();
  });

  it("maps an invalid trade_window to 400", async () => {
    m.leagueRule.findMany.mockResolvedValue([{ id: 7, category: "transactions", key: "trade_window" }]);
    const res = await send();
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "When trades are allowed must be anytime or meeting_day" });
    expect(m.leagueRule.update).not.toHaveBeenCalled();
  });

  it("sends other errors to the normal handler (500)", async () => {
    m.leagueRule.findMany.mockRejectedValue(new Error("db down"));
    expect((await send()).status).toBe(500);
  });
});

describe("PUT /api/leagues/:id/rules audit", () => {
  it("logs RULES_UPDATE with leagueId, updateCount and the changes", async () => {
    m.leagueRule.findMany.mockResolvedValue([{ id: 7, category: "transactions", key: "trade_window" }]);
    m.leagueRule.update.mockResolvedValue({});
    const res = await supertest(app).put("/api/leagues/20/rules").send({ updates: [{ id: 7, value: "meeting_day" }] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, updated: 1 });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "RULES_UPDATE",
      resourceType: "LeagueRule",
      resourceId: 20,
      metadata: { leagueId: 20, updateCount: 1, changes: [{ category: "transactions", key: "trade_window", value: "meeting_day" }] },
    }));
  });
});
