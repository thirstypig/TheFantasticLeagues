import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response, NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    league: { findUnique: vi.fn(), delete: vi.fn() },
    team: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    roster: { updateMany: vi.fn(), deleteMany: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn() },
    auctionBid: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auctionLot: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auctionSession: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    tradeItem: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    trade: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    waiverClaim: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    transactionEvent: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    teamStatsPeriod: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    teamStatsSeason: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    leagueMembership: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    leagueRule: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    period: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

vi.mock("../../commissioner/services/CommissionerService.js", () => {
  const createLeague = vi.fn();
  const addMember = vi.fn();
  const importRosters = vi.fn();
  return {
    CommissionerService: class {
      createLeague = createLeague;
      addMember = addMember;
      importRosters = importRosters;
    },
    __mockFns: { createLeague, addMember, importRosters },
  };
});
vi.mock("../../players/services/mlbSyncService.js", () => ({
  syncNLPlayers: vi.fn().mockResolvedValue({ created: 10, updated: 5, total: 15 }),
}));
vi.mock("../../../lib/schemas.js", () => ({
  addMemberSchema: { parse: vi.fn() },
}));

import { prisma } from "../../../db/prisma.js";
import { syncNLPlayers } from "../../players/services/mlbSyncService.js";
import { __mockFns } from "../../commissioner/services/CommissionerService.js";

const mockPrisma = prisma as any;
const { createLeague: mockCreateLeague, addMember: mockAddMember, importRosters: mockImportRosters } = __mockFns as any;

// ── Express test app ─────────────────────────────────────────────

import express from "express";
import { adminRouter } from "../routes.js";
import supertest from "supertest";

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: true };
  next();
});
app.use(adminRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error" });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /admin/league ───────────────────────────────────────────

describe("POST /admin/league", () => {
  it("creates a league successfully", async () => {
    mockCreateLeague.mockResolvedValue({ id: 1, name: "OGBA", season: 2026 });

    const res = await supertest(app)
      .post("/admin/league")
      .send({ name: "OGBA", season: 2026 });

    expect(res.status).toBe(200);
    expect(res.body.league.name).toBe("OGBA");
    expect(mockCreateLeague).toHaveBeenCalledOnce();
  });

  it("returns 400 for missing name", async () => {
    const res = await supertest(app)
      .post("/admin/league")
      .send({ name: "", season: 2026 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing name");
  });

  it("returns 400 for invalid season", async () => {
    const res = await supertest(app)
      .post("/admin/league")
      .send({ name: "Test", season: 999 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid season");
  });
});

// ── POST /admin/league/:leagueId/members ─────────────────────────

describe("POST /admin/league/:leagueId/members", () => {
  it("adds a member to a league", async () => {
    mockAddMember.mockResolvedValue({
      status: "added",
      membership: { id: 5, userId: 2, leagueId: 1, role: "OWNER" },
    });

    const res = await supertest(app)
      .post("/admin/league/1/members")
      .send({ userId: 2, role: "OWNER" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("added");
    expect(res.body.membership.role).toBe("OWNER");
  });

  it("returns 400 for invalid leagueId", async () => {
    const res = await supertest(app)
      .post("/admin/league/abc/members")
      .send({ userId: 2, role: "OWNER" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid leagueId");
  });
});

// ── POST /admin/league/:leagueId/import-rosters ──────────────────

describe("POST /admin/league/:leagueId/import-rosters", () => {
  it("imports rosters from CSV text", async () => {
    mockImportRosters.mockResolvedValue({ success: true, imported: 23 });

    const res = await supertest(app)
      .post("/admin/league/1/import-rosters")
      .set("Content-Type", "text/csv")
      .send("player,team,pos\nMike Trout,ABC,CF");

    expect(res.status).toBe(200);
    expect(mockImportRosters).toHaveBeenCalledWith(1, expect.any(String));
  });

  it("returns 400 for invalid leagueId", async () => {
    const res = await supertest(app)
      .post("/admin/league/abc/import-rosters")
      .set("Content-Type", "text/csv")
      .send("data");

    expect(res.status).toBe(400);
  });
});

// ── POST /admin/league/:leagueId/reset-rosters ──────────────────

describe("POST /admin/league/:leagueId/reset-rosters", () => {
  it("resets all active rosters", async () => {
    mockPrisma.league.findUnique.mockResolvedValue({
      id: 1,
      teams: [{ id: 10 }, { id: 11 }],
    });
    mockPrisma.roster.updateMany.mockResolvedValue({ count: 46 });

    const res = await supertest(app)
      .post("/admin/league/1/reset-rosters")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.releasedCount).toBe(46);
  });

  it("returns 404 for non-existent league", async () => {
    mockPrisma.league.findUnique.mockResolvedValue(null);

    const res = await supertest(app)
      .post("/admin/league/999/reset-rosters")
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("League not found");
  });
});

// ── DELETE /admin/league/:leagueId ───────────────────────────────

describe("DELETE /admin/league/:leagueId", () => {
  it("deletes a league and all data", async () => {
    mockPrisma.league.findUnique.mockResolvedValue({ id: 1, name: "Test", season: 2025 });
    mockPrisma.team.findMany.mockResolvedValue([{ id: 10 }]);

    const res = await supertest(app).delete("/admin/league/1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
  });

  it("returns 404 for non-existent league", async () => {
    mockPrisma.league.findUnique.mockResolvedValue(null);

    const res = await supertest(app).delete("/admin/league/999");
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid leagueId", async () => {
    const res = await supertest(app).delete("/admin/league/abc");
    expect(res.status).toBe(400);
  });
});

// ── PATCH /admin/league/:leagueId/team-codes ─────────────────────

describe("PATCH /admin/league/:leagueId/team-codes", () => {
  it("updates team codes", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ id: 10, leagueId: 1 });
    mockPrisma.team.update.mockResolvedValue({ id: 10, code: "ABC" });

    const res = await supertest(app)
      .patch("/admin/league/1/team-codes")
      .send({ codes: { "10": "abc" } });

    expect(res.status).toBe(200);
    expect(res.body.updated).toHaveLength(1);
    expect(res.body.updated[0].code).toBe("ABC"); // uppercased
  });

  it("skips teams not in the league", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ id: 10, leagueId: 2 }); // different league

    const res = await supertest(app)
      .patch("/admin/league/1/team-codes")
      .send({ codes: { "10": "abc" } });

    expect(res.status).toBe(200);
    expect(res.body.updated).toHaveLength(0);
  });
});

// ── POST /admin/sync-mlb-players ─────────────────────────────────

describe("POST /admin/sync-mlb-players", () => {
  it("syncs MLB players for current year", async () => {
    const res = await supertest(app)
      .post("/admin/sync-mlb-players")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.created).toBe(10);
    expect(syncNLPlayers).toHaveBeenCalledOnce();
  });

  it("accepts custom season", async () => {
    const res = await supertest(app)
      .post("/admin/sync-mlb-players")
      .send({ season: 2025 });

    expect(res.status).toBe(200);
    expect(syncNLPlayers).toHaveBeenCalledWith(2025);
  });
});

// ── GET /admin/audit-log ─────────────────────────────────────────

describe("GET /admin/audit-log", () => {
  it("returns paginated audit entries", async () => {
    const entries = [{ id: 1, action: "LEAGUE_CREATE", createdAt: new Date() }];
    mockPrisma.auditLog.findMany.mockResolvedValue(entries);
    mockPrisma.auditLog.count.mockResolvedValue(1);

    const res = await supertest(app).get("/admin/audit-log");

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.limit).toBe(50);
    expect(res.body.offset).toBe(0);
  });

  it("filters by action", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    const res = await supertest(app).get("/admin/audit-log?action=LEAGUE_CREATE");

    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ action: "LEAGUE_CREATE" }),
      })
    );
  });

  it("caps limit at 200", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    const res = await supertest(app).get("/admin/audit-log?limit=500");

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(200);
  });
});
