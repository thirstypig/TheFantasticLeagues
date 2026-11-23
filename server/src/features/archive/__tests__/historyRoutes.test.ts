import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import supertest from "supertest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    franchiseMembership: { findFirst: vi.fn() },
    historicalSeason: { findMany: vi.fn(), findFirst: vi.fn() },
    historicalTeam: { findMany: vi.fn() },
    historicalRosterEntry: { findMany: vi.fn() },
    historicalPlayerMatch: { findMany: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => (req.user ? next() : res.status(401).end()),
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireLeagueMember: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { ArchiveSeasonListResponseSchema, ArchiveSeasonResponseSchema } from "../../../../../shared/api/archiveSeason.js";
import { prisma } from "../../../db/prisma.js";
import { archiveRouter } from "../routes.js";

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Fn>>;
const MEMBER_SCOPE = { league: { franchise: { memberships: { some: { userId: 42 } } } } };

function app(user: { id: number; isAdmin: boolean } | null) {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => { (req as unknown as { user: unknown }).user = user; next(); });
  a.use("/api", archiveRouter);
  return supertest(a);
}

beforeEach(() => {
  vi.resetAllMocks();
  db.franchiseMembership.findFirst.mockResolvedValue({ id: 7 });
});

describe("GET /api/archive/history", () => {
  it("lists the member's franchise's seasons, newest first, with each champion", async () => {
    db.historicalSeason.findMany.mockResolvedValue([
      { year: 2012, teams: [{ name: "MoneyBall", ownerName: "Mike Gin", recordedTotal: 351 }, { name: "Dodger Dawgs", ownerName: "Kurt Sakamoto", recordedTotal: 394.5 }] },
      { year: 2003, teams: [{ name: "Demolition Lumber Co.", ownerName: null, recordedTotal: 275 }] },
    ]);
    const res = await app({ id: 42, isAdmin: false }).get("/api/archive/history").expect(200);
    expect(db.historicalSeason.findMany.mock.calls[0][0].where).toEqual({ ...MEMBER_SCOPE, teams: { some: {} } });
    expect(ArchiveSeasonListResponseSchema.parse(res.body)).toEqual(res.body);
    expect(res.body.seasons).toEqual([
      { year: 2012, champion: { owner: "Kurt Sakamoto", teamName: "Dodger Dawgs" } },
      { year: 2003, champion: { owner: null, teamName: "Demolition Lumber Co." } },
    ]);
  });

  it("is closed to non-members", async () => {
    db.franchiseMembership.findFirst.mockResolvedValue(null);
    await app({ id: 42, isAdmin: false }).get("/api/archive/history").expect(403);
    expect(db.historicalSeason.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/archive/history/:year", () => {
  it("returns the season built from its teams, rosters (no salaries) and player-check names", async () => {
    db.historicalSeason.findFirst.mockResolvedValue({ id: 9, year: 2003, keepersFromSheet: false });
    db.historicalTeam.findMany.mockResolvedValue([{ code: "DLC", name: "Demolition Lumber Co.", ownerName: "Yuji Ogasa", recordedPeriodPoints: [40, 41], recordedTotal: 275, note: null }]);
    db.historicalRosterEntry.findMany.mockResolvedValue([{ teamCode: "DLC", kind: "FINAL", periodNumber: null, slot: "C", playerName: "J. Kendall", salary: null, salaryNote: null, isKeeper: false }]);
    db.historicalPlayerMatch.findMany.mockResolvedValue([{ key: "2003|DLC|j|kendall|H", mlbId: 116974, mlbName: "Jason Kendall" }]);
    const res = await app({ id: 1, isAdmin: true }).get("/api/archive/history/2003").expect(200);
    expect(db.historicalSeason.findFirst.mock.calls[0][0].where).toEqual({ year: 2003, teams: { some: {} } });
    expect(db.historicalRosterEntry.findMany.mock.calls[0][0].where).toEqual({ seasonId: 9, kind: { not: "SALARIES" } });
    expect(ArchiveSeasonResponseSchema.parse(res.body)).toEqual(res.body);
    expect(res.body.rosters.DLC.final[0]).toMatchObject({ name: "J. Kendall", mlbName: "Jason Kendall", mlbId: 116974 });
    expect(res.body.teams[0]).toMatchObject({ owner: "Yuji Ogasa", rank: 1, total: 275 });
  });

  it("scopes a member to his franchise, 404s a missing season, and 400s a non-year", async () => {
    db.historicalSeason.findFirst.mockResolvedValue(null);
    await app({ id: 42, isAdmin: false }).get("/api/archive/history/1999").expect(404);
    expect(db.historicalSeason.findFirst.mock.calls[0][0].where).toEqual({ year: 1999, ...MEMBER_SCOPE, teams: { some: {} } });
    await app({ id: 42, isAdmin: false }).get("/api/archive/history/abc").expect(400);
  });
});
