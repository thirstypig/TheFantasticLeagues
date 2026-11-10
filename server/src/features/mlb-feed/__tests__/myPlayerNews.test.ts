/**
 * Tests for `GET /api/mlb/my-player-news` — 7-day MLB transactions filtered
 * to the owner's rostered players.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findFirst: vi.fn() },
    roster: { findMany: vi.fn() },
  },
}));

vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock("../../../lib/mlbApi.js", () => ({
  mlbGetJson: vi.fn(),
  fetchMlbTeamsMap: vi.fn().mockResolvedValue({
    145: "CWS", // AL
    121: "NYM", // NL
    119: "LAD", // NL
    111: "BOS", // AL
  }),
}));

vi.mock("../../../lib/mlbCache.js", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

vi.mock("../../../lib/utils.js", async () => {
  const actual = await vi.importActual<any>("../../../lib/utils.js");
  return { ...actual, mlbGameDayDate: vi.fn(() => "2026-04-28") };
});

vi.mock("../digestRoutes.js", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require("express");
  return { digestRouter: express.Router() };
});

import { prisma } from "../../../db/prisma.js";
import { mlbGetJson } from "../../../lib/mlbApi.js";
import { logger } from "../../../lib/logger.js";

const mockPrisma = prisma as any;
const mockMlbGetJson = mlbGetJson as ReturnType<typeof vi.fn>;
const mockLogger = logger as any;

import express from "express";
import supertest from "supertest";
import { mlbFeedRouter } from "../routes.js";

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 42, isAdmin: false };
  next();
});
app.use(mlbFeedRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  console.error("[test-app] unhandled", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// ── Fixtures (statsapi transaction shape) ───────────────────────────────

function tx(over: Record<string, any>) {
  return {
    id: 1,
    date: "2026-04-27",
    effectiveDate: "2026-04-27",
    typeCode: "SC",
    typeDesc: "Status Change",
    description: "Chicago White Sox activated LHP Noah Schultz from the 15-day injured list.",
    person: { id: 100, fullName: "Noah Schultz", link: "/api/v1/people/100" },
    toTeam: { id: 145, name: "Chicago White Sox" },
    ...over,
  };
}

const URL = "/my-player-news?leagueId=20";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.team.findFirst.mockResolvedValue({ id: 7 });
  mockPrisma.roster.findMany.mockResolvedValue([
    { player: { mlbId: 100 } },
    { player: { mlbId: 200 } },
  ]);
});

describe("GET /my-player-news", () => {
  it("requests the 7-day transaction window", async () => {
    mockMlbGetJson.mockResolvedValue({ transactions: [] });
    const res = await supertest(app).get(URL);
    expect(res.status).toBe(200);
    expect(mockMlbGetJson).toHaveBeenCalledWith(
      "https://statsapi.mlb.com/api/v1/transactions?startDate=2026-04-22&endDate=2026-04-28",
      1800,
    );
    expect(mockPrisma.roster.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId: 7, releasedAt: null, player: { mlbId: { not: null } } },
      }),
    );
  });

  it("returns only rostered players and kept type codes, newest first", async () => {
    mockMlbGetJson.mockResolvedValue({
      transactions: [
        tx({ id: 1, date: "2026-04-25" }),
        tx({ id: 2, date: "2026-04-27", typeCode: "OPT", description: "Optioned." , person: { id: 200, fullName: "Other Guy" } }),
        tx({ id: 3, date: "2026-04-27", typeCode: "CU", description: "Recalled." }),
        tx({ id: 4, date: "2026-04-27", person: { id: 999, fullName: "Not Mine" } }),
        tx({ id: 5, date: "2026-04-27", typeCode: "ASG", description: "Assigned." }),
        tx({ id: 6, date: "2026-04-27", typeCode: "SFA", description: "Signed." }),
      ],
    });
    const res = await supertest(app).get(URL);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: any) => i.id)).toEqual([3, 2, 1]);
    expect(res.body.items[0]).toMatchObject({
      id: 3,
      date: "2026-04-27",
      playerName: "Noah Schultz",
      mlbId: 100,
      typeCode: "CU",
      description: "Recalled.",
    });
  });

  it("labels from/to leagues", async () => {
    mockMlbGetJson.mockResolvedValue({
      transactions: [
        tx({ id: 1, typeCode: "TR", description: "Traded.", fromTeam: { id: 121, name: "New York Mets" }, toTeam: { id: 145, name: "Chicago White Sox" } }),
        tx({ id: 2, typeCode: "TR", description: "Traded.", fromTeam: { id: 121, name: "New York Mets" }, toTeam: { id: 119, name: "Los Angeles Dodgers" } }),
        tx({ id: 3, typeCode: "TR", description: "Traded.", fromTeam: { id: 5555, name: "Mystery" }, toTeam: { id: 111, name: "Boston Red Sox" } }),
      ],
    });
    const res = await supertest(app).get(URL);
    const byId = Object.fromEntries(res.body.items.map((i: any) => [i.id, i]));
    expect(byId[1]).toMatchObject({ fromTeamAbbr: "NYM", toTeamAbbr: "CWS", fromLeague: "NL", toLeague: "AL" });
    expect(byId[2]).toMatchObject({ fromLeague: "NL", toLeague: "NL" });
    expect(byId[3]).toMatchObject({ fromTeamAbbr: null, fromLeague: null, toTeamAbbr: "BOS", toLeague: "AL" });
  });

  it("returns empty items when the user has no team", async () => {
    mockPrisma.team.findFirst.mockResolvedValue(null);
    const res = await supertest(app).get(URL);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
    expect(mockMlbGetJson).not.toHaveBeenCalled();
  });

  it("returns empty items when statsapi fails", async () => {
    mockMlbGetJson.mockRejectedValue(new Error("boom"));
    const res = await supertest(app).get(URL);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
