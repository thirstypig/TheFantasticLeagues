import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import supertest from "supertest";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({ prisma: {} }));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));
vi.mock("../archiveAccess.js", () => ({
  requireArchiveAccess: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../playerCheckRoutes.js", () => ({ playerCheckRouter: express.Router() }));
vi.mock("../historyRoutes.js", () => ({ archiveHistoryRouter: express.Router() }));
vi.mock("../services/trophyCaseService.js", () => ({
  computeTrophyCase: vi.fn().mockResolvedValue({ championships: [] }),
}));

import { archiveRouter } from "../routes.js";
import { computeTrophyCase } from "../services/trophyCaseService.js";

const app = express();
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as any).user = { id: 1, isAdmin: false };
  next();
});
app.use(archiveRouter);
app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error" });
});

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("GET /archive/search-mlb", () => {
  it("returns nothing for a query under 2 characters, without calling MLB", async () => {
    const res = await supertest(app).get("/archive/search-mlb?query=a");
    expect(res.body).toEqual({ players: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps the statsapi people search to the roster search shape", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        people: [
          { id: 660271, fullName: "Shohei Ohtani", active: true, primaryPosition: { abbreviation: "TWP" }, currentTeam: { name: "Los Angeles Dodgers" } },
          { id: 1, fullName: "Old Timer" },
        ],
      }),
    });
    const res = await supertest(app).get("/archive/search-mlb?query=%20ohtani%20");
    expect(fetchMock).toHaveBeenCalledWith("https://statsapi.mlb.com/api/v1/people/search?names=ohtani&sportId=1");
    expect(res.body.players).toEqual([
      { id: 660271, name: "Shohei Ohtani", mlbId: 660271, position: "TWP", team: "Los Angeles Dodgers", active: true },
      { id: 1, name: "Old Timer", mlbId: 1, position: "UT", team: "Free Agent" },
    ]);
  });

  it("returns nothing when MLB answers with an error", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const res = await supertest(app).get("/archive/search-mlb?query=ohtani");
    expect(res.body).toEqual({ players: [] });
  });
});

describe("GET /archive/trophy-case", () => {
  it("returns the trophy case for the league", async () => {
    const res = await supertest(app).get("/archive/trophy-case?leagueId=1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ championships: [] });
    expect(computeTrophyCase).toHaveBeenCalledWith(1);
  });

  it("rejects a leagueId that isn't a number", async () => {
    const res = await supertest(app).get("/archive/trophy-case?leagueId=abc");
    expect(res.status).toBe(400);
    expect(computeTrophyCase).not.toHaveBeenCalled();
  });
});

describe("removed endpoints", () => {
  // The old archive API (HistoricalPeriod/PlayerStat/Standing) had no live caller.
  it.each(["/archive/seasons", "/archive/2024/periods", "/archive/2024/period/1/stats", "/archive/2024/draft-results", "/archive/search-players?query=ab"])(
    "%s is gone",
    async (url) => {
      const res = await supertest(app).get(url);
      expect(res.status).toBe(404);
    },
  );
});
