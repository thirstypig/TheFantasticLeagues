import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/prisma.js", () => {
  const prisma: any = {
    team: { findFirst: vi.fn() },
    roster: { findMany: vi.fn(), updateMany: vi.fn() },
    leagueRule: { findUnique: vi.fn() },
  };
  // The route's transaction callback gets the same mocked client as `tx`.
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
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
import router from "../routes.js";
import { prisma } from "../../../db/prisma.js";
import { writeAuditLog } from "../../../lib/auditLog.js";

const m = prisma as any;

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: any) => { req.user = { id: 42 }; next(); });
app.use("/api", router);
app.use((_err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: "Internal Server Error" }));

const save = (keeperIds: unknown) => supertest(app).post("/api/leagues/20/my-roster/keepers").send({ keeperIds });

/** keeper_count / keepers_locked rules, read by the real KeeperPrepService. */
function rules({ limit, locked }: { limit?: string; locked?: string }) {
  m.leagueRule.findUnique.mockImplementation(async ({ where }: any) => {
    const key = where.leagueId_category_key.key;
    if (key === "keeper_count" && limit !== undefined) return { value: limit };
    if (key === "keepers_locked" && locked !== undefined) return { value: locked };
    return null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.team.findFirst.mockResolvedValue({ id: 7, leagueId: 20 });
  // Echo back one roster row per requested id, as if every id is valid.
  m.roster.findMany.mockImplementation(async ({ where }: any) => where.id.in.map((id: number) => ({ id, teamId: 7 })));
  m.roster.updateMany.mockResolvedValue({ count: 0 });
  rules({ limit: "4", locked: "false" });
});

describe("POST /api/leagues/:id/my-roster/keepers", () => {
  it("only finds a team the caller owns, in this league", async () => {
    await save([11]);
    expect(m.team.findFirst).toHaveBeenCalledWith({
      where: { leagueId: 20, OR: [{ ownerUserId: 42 }, { ownerships: { some: { userId: 42 } } }] },
    });
  });

  it("refuses a caller with no team in the league (403) and writes nothing", async () => {
    m.team.findFirst.mockResolvedValue(null);
    const res = await save([11]);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "You do not own a team in this league." });
    expect(m.$transaction).not.toHaveBeenCalled();
  });

  it("checks roster ids against the caller's team and only active (unreleased) rows", async () => {
    await save([11, 12]);
    expect(m.roster.findMany).toHaveBeenCalledWith({
      where: { teamId: 7, id: { in: [11, 12] }, releasedAt: null },
    });
  });

  it("refuses a roster id that isn't an active row on the caller's team (400)", async () => {
    // Row 99 belongs to another team, or was released (dropped/traded away).
    m.roster.findMany.mockResolvedValue([{ id: 11, teamId: 7 }]);
    const res = await save([11, 99]);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "One or more invalid roster IDs provided." });
    expect(m.$transaction).not.toHaveBeenCalled();
  });

  it("refuses once keepers are locked (403) and writes nothing", async () => {
    rules({ limit: "4", locked: "true" });
    const res = await save([11]);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Keeper selections are locked for this league." });
    expect(m.$transaction).not.toHaveBeenCalled();
  });

  it("refuses more keepers than the league's keeper_count (400)", async () => {
    rules({ limit: "2", locked: "false" });
    const res = await save([11, 12, 13]);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "You can only select up to 2 keepers." });
    expect(m.$transaction).not.toHaveBeenCalled();
  });

  it("allows exactly keeper_count keepers", async () => {
    rules({ limit: "2", locked: "false" });
    expect((await save([11, 12])).status).toBe(200);
  });

  it("defaults the limit to 4 when the league has no keeper_count rule", async () => {
    rules({ locked: "false" });
    expect((await save([1, 2, 3, 4])).status).toBe(200);
    const res = await save([1, 2, 3, 4, 5]);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "You can only select up to 4 keepers." });
  });

  it("clears the team's keepers, then marks only the chosen rows, and logs it", async () => {
    const res = await save([11, 12]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, count: 2 });
    expect(m.roster.updateMany).toHaveBeenNthCalledWith(1, { where: { teamId: 7 }, data: { isKeeper: false } });
    expect(m.roster.updateMany).toHaveBeenNthCalledWith(2, { where: { id: { in: [11, 12] } }, data: { isKeeper: true } });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: 42,
      action: "KEEPER_SAVE",
      resourceType: "Roster",
      metadata: { leagueId: 20, teamId: 7, keeperCount: 2 },
    }));
  });

  it("an empty list clears every keeper and sets none", async () => {
    const res = await save([]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, count: 0 });
    expect(m.roster.updateMany).toHaveBeenCalledTimes(1);
    expect(m.roster.updateMany).toHaveBeenCalledWith({ where: { teamId: 7 }, data: { isKeeper: false } });
  });

  it("rejects a body that isn't a list of positive integers (400) before touching the DB", async () => {
    for (const bad of [undefined, "11", [0], [-3], [1.5]]) {
      const res = await save(bad);
      expect(res.status).toBe(400);
    }
    expect(m.team.findFirst).not.toHaveBeenCalled();
  });
});
