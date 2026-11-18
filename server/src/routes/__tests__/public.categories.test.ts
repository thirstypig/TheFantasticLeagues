import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import supertest from "supertest";

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    league: { findFirst: vi.fn() },
    period: { findMany: vi.fn() },
  },
}));
vi.mock("express-rate-limit", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../features/standings/services/standingsService.js", async () => {
  const actual = await vi.importActual<any>("../../features/standings/services/standingsService.js");
  return { ...actual, computeTeamStatsFromDb: vi.fn() };
});
vi.mock("../../lib/leagueCategories.js", async () => {
  const actual = await vi.importActual<any>("../../lib/leagueCategories.js");
  return { ...actual, getLeagueCategories: vi.fn() };
});

import { prisma } from "../../db/prisma.js";
import { getLeagueCategories, SCORABLE_CATEGORIES } from "../../lib/leagueCategories.js";
import { computeTeamStatsFromDb } from "../../features/standings/services/standingsService.js";
import { publicRouter } from "../public.js";

const p = prisma as any;
const app = express();
app.use("/api", publicRouter);

const stat = (R: number, HR: number) => ({
  R, HR, RBI: 0, SB: 0, AVG: 0.25, W: 0, S: 0, K: 0, ERA: 4, WHIP: 1.3,
});

beforeEach(() => {
  vi.clearAllMocks();
  p.league.findFirst.mockResolvedValue({ id: 7, name: "L", season: 2026, scoringFormat: "roto" });
  p.period.findMany.mockResolvedValue([
    { id: 9, name: "P1", status: "active", startDate: new Date(), endDate: new Date() },
  ]);
  (computeTeamStatsFromDb as any).mockResolvedValue([
    { team: { id: 1, name: "A", code: "AAA" }, stats: stat(50, 10) },
    { team: { id: 2, name: "B", code: "BBB" }, stats: stat(40, 5) },
    { team: { id: 3, name: "C", code: "CCC" }, stats: stat(30, 1) },
  ]);
});

describe("public standings — league categories", () => {
  it("scores only the league's categories: a team winning both gets 2 x N points", async () => {
    (getLeagueCategories as any).mockResolvedValue(
      SCORABLE_CATEGORIES.filter((c) => ["R", "HR"].includes(c.key)),
    );
    const res = await supertest(app).get("/api/public/leagues/some-slug/standings");
    expect(res.status).toBe(200);
    expect(getLeagueCategories).toHaveBeenCalledWith(7);
    const top = res.body.standings.find((s: any) => s.teamId === 1);
    expect(top.points).toBe(2 * 3);
  });
});
