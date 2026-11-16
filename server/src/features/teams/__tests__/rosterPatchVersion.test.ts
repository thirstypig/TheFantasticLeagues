/**
 * PATCH /api/teams/:teamId/roster/:rosterId — optimistic-concurrency contract
 * (todo #181). Uses the REAL rosterVersionGuard against a mocked prisma so the
 * assertions are on the query args and the response bodies the client sees.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const txRosterUpdate = vi.fn();
const txTeamUpdate = vi.fn();

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
  mp.roster.findUnique.mockResolvedValue({
    id: 99,
    teamId: 7,
    team: { id: 7 },
    player: { name: "X", posList: "SS" },
  });
  mp.$transaction.mockImplementation(async (fn: any) =>
    fn({ roster: { update: txRosterUpdate }, team: { update: txTeamUpdate } }),
  );
  txRosterUpdate.mockResolvedValue({ id: 99, assignedPosition: "SS" });
  txTeamUpdate.mockResolvedValue({ rosterVersion: 4 });
  // resolveLeagueIdFromTeam and the guard both call team.findUnique.
  mp.team.findUnique.mockImplementation(async (args: any) =>
    args.select?.leagueId ? { leagueId: 1 } : { rosterVersion: 3 },
  );
});

describe("PATCH roster If-Match guard", () => {
  it("409s with the current version when If-Match is stale, and writes nothing", async () => {
    const res = await supertest(app).patch(url).set("If-Match", "2").send({ assignedPosition: "SS" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: "Roster changed since you last loaded it",
      rosterVersion: 3,
    });
    expect(mp.$transaction).not.toHaveBeenCalled();
    expect(txRosterUpdate).not.toHaveBeenCalled();
    expect(txTeamUpdate).not.toHaveBeenCalled();
  });

  it("428s with a plain-English error when If-Match is missing, and writes nothing", async () => {
    const res = await supertest(app).patch(url).send({ assignedPosition: "SS" });
    expect(res.status).toBe(428);
    expect(res.body.error).toMatch(/roster version/i);
    expect(mp.$transaction).not.toHaveBeenCalled();
    expect(txRosterUpdate).not.toHaveBeenCalled();
  });

  it("applies the swap and bumps the counter in one transaction when If-Match matches", async () => {
    const res = await supertest(app).patch(url).set("If-Match", "3").send({ assignedPosition: "SS" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ roster: { id: 99, assignedPosition: "SS" }, rosterVersion: 4 });
    expect(mp.$transaction).toHaveBeenCalledTimes(1);
    expect(txRosterUpdate).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { assignedPosition: "SS" },
    });
    expect(txTeamUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { rosterVersion: { increment: 1 } },
      select: { rosterVersion: true },
    });
  });

  it("If-Match: * is accepted without a version lookup for the guard", async () => {
    const res = await supertest(app).patch(url).set("If-Match", "*").send({ assignedPosition: "SS" });
    expect(res.status).toBe(200);
    // Only the leagueId lookup from resolveLeagueIdFromTeam, no rosterVersion read.
    const versionReads = mp.team.findUnique.mock.calls.filter(
      (c: any[]) => c[0]?.select?.rosterVersion,
    );
    expect(versionReads).toHaveLength(0);
    expect(txTeamUpdate).toHaveBeenCalledTimes(1);
  });

  it("a second PATCH replaying the first token gets 409 after the counter moved", async () => {
    // Version 3 -> 4 after the first write; the server now reports 4.
    await supertest(app).patch(url).set("If-Match", "3").send({ assignedPosition: "SS" });
    mp.team.findUnique.mockImplementation(async (args: any) =>
      args.select?.leagueId ? { leagueId: 1 } : { rosterVersion: 4 },
    );
    const res = await supertest(app).patch(url).set("If-Match", "3").send({ assignedPosition: "2B" });
    expect(res.status).toBe(409);
    expect(res.body.rosterVersion).toBe(4);
  });
});
