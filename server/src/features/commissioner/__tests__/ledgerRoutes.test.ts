import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// The real requireCommissionerOrAdmin runs (owner → 403); requireAuth is
// replaced by a header-driven stub so each test picks its user.
const fx = vi.hoisted(() => ({
  memberships: new Map<string, string>(), // `${leagueId}:${userId}` → role
  ledger: [] as any[],
  teams: [
    { id: 1, leagueId: 20, name: "Alpha" },
    { id: 9, leagueId: 99, name: "Other league" },
  ],
  writes: [] as { op: string; args: any }[],
}));

vi.mock("../../../db/prisma.js", () => {
  const inLeague = (r: any, where: any) =>
    !where?.team || fx.teams.find((t) => t.id === r.teamId)?.leagueId === where.team.leagueId;
  const financeLedger = {
    findFirst: vi.fn(async ({ where }: any) => fx.ledger.find((r) => r.id === where.id && inLeague(r, where)) ?? null),
    findMany: vi.fn(async (args: any) =>
      fx.ledger
        .filter((r) => inLeague(r, args.where) && (args.where.type === undefined || r.type === args.where.type)
          && (args.where.reversalOf === undefined || r.reversalOf === args.where.reversalOf))
        .map((r) => ({ ...r, team: { name: fx.teams.find((t) => t.id === r.teamId)!.name }, period: r.periodId ? { name: "Period 9" } : null }))),
    updateMany: vi.fn(async (args: any) => {
      fx.writes.push({ op: "updateMany", args });
      const hit = fx.ledger.filter((r) => r.id === args.where.id && (args.where.voidedAt !== null || r.voidedAt === null));
      hit.forEach((r) => Object.assign(r, args.data));
      return { count: hit.length };
    }),
    create: vi.fn(async (args: any) => {
      fx.writes.push({ op: "create", args });
      const row = { id: 500 + fx.ledger.length, ts: new Date(), voidedAt: null, playerId: null, ...args.data };
      fx.ledger.push(row);
      return row;
    }),
  };
  const prisma: any = {
    financeLedger,
    leagueMembership: {
      findUnique: vi.fn(async ({ where }: any) => {
        const role = fx.memberships.get(`${where.leagueId_userId.leagueId}:${where.leagueId_userId.userId}`);
        return role ? { role } : null;
      }),
    },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma };
});

vi.mock("../../../middleware/auth.js", async () => {
  const actual: any = await vi.importActual("../../../middleware/auth.js");
  return {
    ...actual,
    requireAuth: (req: any, _res: unknown, next: () => void) => {
      req.user = { id: Number(req.headers["x-user"]), isAdmin: false };
      next();
    },
  };
});
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));

import express from "express";
import supertest from "supertest";
import { writeAuditLog } from "../../../lib/auditLog.js";

const { ledgerRouter } = await import("../ledgerRoutes.js");
const app = express();
app.use(express.json());
app.use("/api", ledgerRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => res.status(500).json({ error: err?.message }));

// Unique user ids per test: the auth middleware caches memberships by user.
let nextUser = 1000;
function commissioner() { const u = nextUser++; fx.memberships.set(`20:${u}`, "COMMISSIONER"); return String(u); }
function owner() { const u = nextUser++; fx.memberships.set(`20:${u}`, "OWNER"); return String(u); }

const fee = (id: number, teamId = 1, extra: any = {}) => ({
  id, teamId, periodId: 41, playerId: null, type: "meeting_overtime", amount: 5,
  reason: "Over time at the Period 9 meeting", ts: new Date(`2026-11-15T20:0${id % 10}:00Z`),
  voidedAt: null, reversalOf: null, createdBy: 7, ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  fx.writes = [];
  fx.ledger = [fee(1), fee(2), { ...fee(3), type: "entry_fee", amount: 50 }, fee(4, 9)];
});

describe("POST /api/commissioner/:leagueId/ledger/:entryId/void", () => {
  it("voids for the commissioner: stamp + negated reversal, audit-logged", async () => {
    const res = await supertest(app).post("/api/commissioner/20/ledger/1/void").set("x-user", commissioner());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ entryId: 1, teamId: 1, amount: 5 });
    expect(fx.writes.map((w) => w.op)).toEqual(["updateMany", "create"]);
    expect(fx.writes[1].args.data).toMatchObject({ amount: -5, reversalOf: 1, type: "meeting_overtime" });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "LEDGER_VOID", resourceType: "FinanceLedger", resourceId: 1,
    }));
  });

  it("403s for an owner and writes nothing", async () => {
    const res = await supertest(app).post("/api/commissioner/20/ledger/1/void").set("x-user", owner());
    expect(res.status).toBe(403);
    expect(fx.writes).toEqual([]);
  });

  it("404s for another league's row", async () => {
    const res = await supertest(app).post("/api/commissioner/20/ledger/4/void").set("x-user", commissioner());
    expect(res.status).toBe(404);
    expect(fx.writes).toEqual([]);
  });

  it("409s on a second void and writes nothing more", async () => {
    const u = commissioner();
    await supertest(app).post("/api/commissioner/20/ledger/1/void").set("x-user", u);
    fx.writes = [];
    const res = await supertest(app).post("/api/commissioner/20/ledger/1/void").set("x-user", u);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("This fee was already voided.");
    expect(fx.writes).toEqual([]);
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
  });

  it("400s on an entry fee and on a bad id", async () => {
    const u = commissioner();
    expect((await supertest(app).post("/api/commissioner/20/ledger/3/void").set("x-user", u)).status).toBe(400);
    expect((await supertest(app).post("/api/commissioner/20/ledger/abc/void").set("x-user", u)).status).toBe(400);
    expect(fx.writes).toEqual([]);
  });
});

describe("GET /api/commissioner/:leagueId/ledger", () => {
  it("lists this league's meeting fees, newest first, with void state, without reversal rows", async () => {
    const u = commissioner();
    await supertest(app).post("/api/commissioner/20/ledger/1/void").set("x-user", u);
    const res = await supertest(app).get("/api/commissioner/20/ledger?type=meeting_overtime").set("x-user", u);
    expect(res.status).toBe(200);
    // Query: one league, one type, originals only, stable newest-first order.
    expect((await import("../../../db/prisma.js")).prisma.financeLedger.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { type: "meeting_overtime", reversalOf: null, team: { leagueId: 20 } },
        orderBy: [{ ts: "desc" }, { id: "desc" }],
      }),
    );
    const ids = res.body.entries.map((e: any) => e.id);
    expect(ids.sort()).toEqual([1, 2]);
    const voided = res.body.entries.find((e: any) => e.id === 1);
    expect(voided).toMatchObject({ teamName: "Alpha", periodName: "Period 9", amount: 5 });
    expect(typeof voided.voidedAt).toBe("string");
    expect(res.body.entries.find((e: any) => e.id === 2).voidedAt).toBeNull();
  });

  it("400s on a type it doesn't list and 403s for an owner", async () => {
    expect((await supertest(app).get("/api/commissioner/20/ledger?type=entry_fee").set("x-user", commissioner())).status).toBe(400);
    expect((await supertest(app).get("/api/commissioner/20/ledger").set("x-user", owner())).status).toBe(403);
  });
});
