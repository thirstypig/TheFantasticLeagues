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
const storage = vi.hoisted(() => ({ download: vi.fn(), from: vi.fn() }));
vi.mock("../../../lib/supabase.js", () => ({ supabaseAdmin: { storage: { from: storage.from } } }));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => (req.user ? next() : res.status(401).end()),
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireLeagueMember: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { ArchiveSeasonListResponseSchema, ArchiveSeasonResponseSchema } from "../../../../../shared/api/archiveSeason.js";
import { prisma } from "../../../db/prisma.js";
import { createHash } from "node:crypto";
import { archiveRouter } from "../routes.js";
import { logger } from "../../../lib/logger.js";
import { sourceWorkbookFor } from "../sourceWorkbooks.js";

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
  storage.from.mockReturnValue({ download: storage.download });
});

describe("GET /api/archive/history", () => {
  it("lists the member's franchise's seasons, newest first, with each champion", async () => {
    db.historicalSeason.findMany.mockResolvedValue([
      { year: 2012, league: { franchiseId: 1 }, teams: [{ name: "MoneyBall", ownerName: "Mike Gin", recordedTotal: 351 }, { name: "Dodger Dawgs", ownerName: "Kurt Sakamoto", recordedTotal: 394.5 }] },
      { year: 2003, league: { franchiseId: 1 }, teams: [{ name: "Demolition Lumber Co.", ownerName: null, recordedTotal: 275 }] },
    ]);
    const res = await app({ id: 42, isAdmin: false }).get("/api/archive/history").expect(200);
    expect(db.historicalSeason.findMany.mock.calls[0][0].where).toEqual({ ...MEMBER_SCOPE, teams: { some: {} } });
    expect(ArchiveSeasonListResponseSchema.parse(res.body)).toEqual(res.body);
    expect(res.body.seasons).toEqual([
      { year: 2012, champion: { owner: "Kurt Sakamoto", teamName: "Dodger Dawgs" }, workbook: { fileName: "Fantasy_Baseball_2012.xls", bytes: 118272 } },
      // 2003 has no workbook of its own: its final rosters are in the 2004 file.
      { year: 2003, champion: { owner: null, teamName: "Demolition Lumber Co." }, workbook: { fileName: "Baseball Rosters 2004.xls", bytes: 40960 } },
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
    db.historicalSeason.findFirst.mockResolvedValue({ id: 9, year: 2003, keepersFromSheet: false, periodEnds: [] });
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

describe("GET /api/archive/history/:year/workbook", () => {
  const wb2012 = sourceWorkbookFor(2012, 1)!;
  const OGBA_2012 = { league: { franchiseId: 1 } };
  /** A Blob-like whose bytes hash to the recorded SHA-256 (or not). */
  const blobOf = (bytes: Buffer) => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) });
  // The real workbooks aren't in the repo, so the success case points the 2012 entry's
  // hash at a stand-in buffer for the length of the test, then restores it.
  const fake = Buffer.from("stand-in for the 2012 workbook");

  it("sends the original file, named as the commissioner named it, only after its hash checks out", async () => {
    db.historicalSeason.findFirst.mockResolvedValue(OGBA_2012);
    const real = { ...wb2012 };
    (wb2012 as { sha256: string }).sha256 = createHash("sha256").update(fake).digest("hex");
    storage.download.mockResolvedValue({ data: blobOf(fake), error: null });
    try {
      const res = await app({ id: 42, isAdmin: false }).get("/api/archive/history/2012/workbook").buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = []; r.on("data", (c: Buffer) => chunks.push(c)); r.on("end", () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(storage.from).toHaveBeenCalledWith("archive-workbooks");
      expect(storage.download).toHaveBeenCalledWith(`${wb2012.sha256}.xls`);
      expect(db.historicalSeason.findFirst.mock.calls[0][0].where).toEqual({
        AND: [{ year: 2012, teams: { some: {} }, league: { franchiseId: 1 } }, MEMBER_SCOPE],
      });
      expect(res.headers["content-type"]).toBe("application/vnd.ms-excel");
      expect(res.headers["content-disposition"]).toBe(`attachment; filename="Fantasy_Baseball_2012.xls"; filename*=UTF-8''Fantasy_Baseball_2012.xls`);
      expect(Buffer.compare(res.body as Buffer, fake)).toBe(0);
    } finally {
      (wb2012 as { sha256: string }).sha256 = real.sha256;
    }
  });

  it("refuses to send a stored file that isn't byte-for-byte the original", async () => {
    db.historicalSeason.findFirst.mockResolvedValue(OGBA_2012);
    storage.download.mockResolvedValue({ data: blobOf(Buffer.from("tampered")), error: null });
    const res = await app({ id: 42, isAdmin: false }).get("/api/archive/history/2012/workbook").expect(500);
    expect(res.body.error).toMatch(/integrity check/);
    expect(logger.error).toHaveBeenCalled();
  });

  it("says the workbook isn't uploaded yet when storage doesn't have it", async () => {
    db.historicalSeason.findFirst.mockResolvedValue(OGBA_2012);
    storage.download.mockResolvedValue({ data: null, error: { message: "Object not found" } });
    const res = await app({ id: 42, isAdmin: false }).get("/api/archive/history/2012/workbook").expect(404);
    expect(res.body.error).toMatch(/hasn't been uploaded/);
  });

  it("gives nothing for a season the viewer can't see, or one without a workbook, without touching storage", async () => {
    db.historicalSeason.findFirst.mockResolvedValue(null);
    await app({ id: 42, isAdmin: false }).get("/api/archive/history/2012/workbook").expect(404);
    db.historicalSeason.findFirst.mockResolvedValue(OGBA_2012);
    await app({ id: 42, isAdmin: false }).get("/api/archive/history/1999/workbook").expect(404);
    await app({ id: 42, isAdmin: false }).get("/api/archive/history/abc/workbook").expect(400);
    expect(storage.download).not.toHaveBeenCalled();
  });

  it("is closed to non-members", async () => {
    db.franchiseMembership.findFirst.mockResolvedValue(null);
    await app({ id: 42, isAdmin: false }).get("/api/archive/history/2012/workbook").expect(403);
    expect(storage.download).not.toHaveBeenCalled();
  });

  it("never serves OGBA's file for another franchise's season of the same year", async () => {
    // The query is bound to OGBA, so another franchise's 2012 isn't found...
    db.historicalSeason.findFirst.mockResolvedValue(null);
    await app({ id: 42, isAdmin: false }).get("/api/archive/history/2012/workbook").expect(404);
    expect(db.historicalSeason.findFirst.mock.calls[0][0].where.AND[0].league).toEqual({ franchiseId: 1 });
    // ...and even if a non-OGBA season came back, the registry wouldn't match it.
    db.historicalSeason.findFirst.mockResolvedValue({ league: { franchiseId: 2 } });
    await app({ id: 42, isAdmin: false }).get("/api/archive/history/2012/workbook").expect(404);
    expect(storage.download).not.toHaveBeenCalled();
  });
});

describe("workbooks in the season list belong to OGBA only", () => {
  it("attaches no workbook to another franchise's season", async () => {
    db.historicalSeason.findMany.mockResolvedValue([
      { year: 2012, league: { franchiseId: 2 }, teams: [{ name: "Elsewhere", ownerName: null, recordedTotal: 300 }] },
    ]);
    const res = await app({ id: 1, isAdmin: true }).get("/api/archive/history").expect(200);
    expect(res.body.seasons[0].workbook).toBeNull();
  });
});
