/**
 * PATCH /api/teams/:teamId/roster/:rosterId — optimistic-concurrency contract
 * (todo #181). Uses the REAL rosterVersion lib against a mocked prisma so the
 * assertions are on the query args and the response bodies the client sees.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory stand-in for the team row + roster row, with a transaction that
// is serialized (like a row lock) and rolls back on throw.
const db = { version: 3, assigned: null as string | null };
const txRosterUpdate = vi.fn();
const txTeamUpdateMany = vi.fn();
const txTeamUpdate = vi.fn();
let txQueue: Promise<unknown> = Promise.resolve();

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findUnique: vi.fn() },
    roster: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../../standings/services/standingsService.js", () => ({
  computeStandingsFromStats: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../../lib/positionInherit.js", () => ({
  isEligibleForSlot: vi.fn().mockReturnValue(true),
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/supabase.js", () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() } },
}));
vi.mock("../../../middleware/auth.js", () => {
  const pass = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
    requireTeamOwner: pass,
    requireTeamOwnerOrCommissioner: pass,
    requireLeagueMember: pass,
  };
});
vi.mock("../services/teamService.js", () => ({
  TeamService: class {
    getTeamSummary = vi.fn();
    getTeamHubData = vi.fn();
  },
}));

import express from "express";
import supertest from "supertest";
import { prisma } from "../../../db/prisma.js";
import { teamsRouter } from "../routes.js";

const mp = prisma as any;

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 1, isAdmin: false };
  next();
});
app.use("/api/teams", teamsRouter);

const url = "/api/teams/7/roster/99";

beforeEach(() => {
  vi.clearAllMocks();
  db.version = 3;
  db.assigned = null;
  txQueue = Promise.resolve();
  mp.roster.findUnique.mockResolvedValue({
    id: 99,
    teamId: 7,
    team: { id: 7 },
    player: { name: "X", posList: "SS" },
  });
  txRosterUpdate.mockImplementation(async (args: any) => {
    db.assigned = args.data.assignedPosition;
    return { id: 99, assignedPosition: db.assigned };
  });
  txTeamUpdateMany.mockImplementation(async (args: any) => {
    if (args.where.rosterVersion !== db.version) return { count: 0 };
    db.version += 1;
    return { count: 1 };
  });
  txTeamUpdate.mockImplementation(async () => {
    db.version += 1;
    return { rosterVersion: db.version };
  });
  mp.$transaction.mockImplementation((fn: any) => {
    const run = async () => {
      const snapshot = { ...db };
      try {
        return await fn({
          roster: { update: txRosterUpdate },
          team: { updateMany: txTeamUpdateMany, update: txTeamUpdate },
        });
      } catch (e) {
        Object.assign(db, snapshot); // rollback
        throw e;
      }
    };
    const p = txQueue.then(run, run);
    txQueue = p.catch(() => {});
    return p;
  });
  mp.team.findUnique.mockImplementation(async (args: any) =>
    args.select?.leagueId ? { leagueId: 1 } : { rosterVersion: db.version },
  );
});

describe("PATCH roster If-Match guard", () => {
  it("409s with the current version when If-Match is stale, and the roster write never lands", async () => {
    const res = await supertest(app).patch(url).set("If-Match", "2").send({ assignedPosition: "SS" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Roster changed since you last loaded it", rosterVersion: 3 });
    expect(txTeamUpdateMany).toHaveBeenCalledWith({
      where: { id: 7, rosterVersion: 2 },
      data: { rosterVersion: { increment: 1 } },
    });
    expect(txRosterUpdate).not.toHaveBeenCalled();
    expect(db).toEqual({ version: 3, assigned: null });
  });

  it("428s with a plain-English error when If-Match is missing, and opens no transaction", async () => {
    const res = await supertest(app).patch(url).send({ assignedPosition: "SS" });
    expect(res.status).toBe(428);
    expect(res.body.error).toMatch(/roster version/i);
    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it("409s on a malformed If-Match without opening a transaction", async () => {
    const res = await supertest(app).patch(url).set("If-Match", "banana").send({ assignedPosition: "SS" });
    expect(res.status).toBe(409);
    expect(res.body.rosterVersion).toBe(3);
    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it("applies the swap and compare-and-bumps the counter in one transaction when If-Match matches", async () => {
    const res = await supertest(app).patch(url).set("If-Match", "3").send({ assignedPosition: "SS" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ roster: { id: 99, assignedPosition: "SS" }, rosterVersion: 4 });
    expect(mp.$transaction).toHaveBeenCalledTimes(1);
    expect(txTeamUpdateMany).toHaveBeenCalledWith({
      where: { id: 7, rosterVersion: 3 },
      data: { rosterVersion: { increment: 1 } },
    });
    expect(txRosterUpdate).toHaveBeenCalledWith({ where: { id: 99 }, data: { assignedPosition: "SS" } });
    expect(db).toEqual({ version: 4, assigned: "SS" });
  });

  it("If-Match: * bumps unconditionally with no compare", async () => {
    const res = await supertest(app).patch(url).set("If-Match", "*").send({ assignedPosition: "SS" });
    expect(res.status).toBe(200);
    expect(txTeamUpdateMany).not.toHaveBeenCalled();
    expect(txTeamUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { rosterVersion: { increment: 1 } },
      select: { rosterVersion: true },
    });
    expect(res.body.rosterVersion).toBe(4);
  });

  it("replaying the first token after a successful write 409s, using the real increment", async () => {
    const first = await supertest(app).patch(url).set("If-Match", "3").send({ assignedPosition: "SS" });
    expect(first.status).toBe(200);
    const second = await supertest(app).patch(url).set("If-Match", "3").send({ assignedPosition: "2B" });
    expect(second.status).toBe(409);
    expect(second.body.rosterVersion).toBe(4);
    expect(db.assigned).toBe("SS");
  });

  it("two concurrent writers with the same token: one wins, the loser gets 409 and its write is rolled back", async () => {
    const [a, b] = await Promise.all([
      supertest(app).patch(url).set("If-Match", "3").send({ assignedPosition: "SS" }),
      supertest(app).patch(url).set("If-Match", "3").send({ assignedPosition: "2B" }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;
    const loser = a.status === 200 ? b : a;
    expect(loser.body.rosterVersion).toBe(4);
    // Exactly one roster write persisted, and it is the winner's.
    expect(txRosterUpdate).toHaveBeenCalledTimes(1);
    expect(db).toEqual({ version: 4, assigned: winner.body.roster.assignedPosition });
  });
});
