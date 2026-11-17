import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    period: { findUnique: vi.fn() },
    team: { findMany: vi.fn() },
    waiverClaim: { findMany: vi.fn() },
    playerStatsPeriod: { findMany: vi.fn() },
  },
}));
vi.mock("../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
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
import { computePeriodAwards } from "../periodAwardsService.js";

const p = prisma as any;
const stat = (R: number, HR: number) => ({
  R, HR, RBI: 0, SB: 0, AVG: 0.25, W: 0, S: 0, K: 0, ERA: 4, WHIP: 1.3,
});

beforeEach(() => {
  vi.clearAllMocks();
  p.period.findUnique.mockResolvedValue({
    id: 9, name: "P1", startDate: new Date("2026-04-01"), endDate: new Date("2026-05-01"), leagueId: 7,
  });
  p.team.findMany.mockResolvedValue([
    { id: 1, name: "A", code: "AAA" },
    { id: 2, name: "B", code: "BBB" },
  ]);
  p.waiverClaim.findMany.mockResolvedValue([]);
  p.playerStatsPeriod.findMany.mockResolvedValue([]);
  (computeTeamStatsFromDb as any).mockResolvedValue([
    { team: { id: 1, name: "A", code: "AAA" }, stats: stat(50, 10) },
    { team: { id: 2, name: "B", code: "BBB" }, stats: stat(40, 5) },
  ]);
});

describe("computePeriodAwards — league categories", () => {
  it("Category Kings cover only the league's categories (R, HR)", async () => {
    (getLeagueCategories as any).mockResolvedValue(
      SCORABLE_CATEGORIES.filter((c) => ["R", "HR"].includes(c.key)),
    );
    const awards = await computePeriodAwards(7, 9);
    expect(getLeagueCategories).toHaveBeenCalledWith(7);
    expect(awards.categoryKings.map((k) => k.category)).toEqual(["R", "HR"]);
  });

  it("standard-10 league keeps ten Category Kings", async () => {
    (getLeagueCategories as any).mockResolvedValue(SCORABLE_CATEGORIES);
    const awards = await computePeriodAwards(7, 9);
    expect(awards.categoryKings).toHaveLength(10);
  });
});
