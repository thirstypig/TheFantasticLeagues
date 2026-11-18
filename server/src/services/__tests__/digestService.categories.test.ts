// Lives outside features/ on purpose: it stubs standings + awards, and ADR-015 forbids
// feature-to-feature imports (tests included).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    league: { findUnique: vi.fn() },
    team: { findMany: vi.fn() },
    aiInsight: { findFirst: vi.fn() },
    period: { findFirst: vi.fn() },
    roster: { findMany: vi.fn() },
  },
}));
vi.mock("../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../lib/mlbApi.js", () => ({
  mlbGetJson: vi.fn(),
  fetchMlbTeamsMap: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../features/awards/services/awardsService.js", () => ({
  computeAwardsRankings: vi.fn().mockResolvedValue({}),
  formatMvpForPrompt: vi.fn().mockReturnValue(""),
  formatCyYoungForPrompt: vi.fn().mockReturnValue(""),
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
import { buildDigestContext } from "../../features/mlb-feed/services/digestService.js";

const p = prisma as any;
const RH = SCORABLE_CATEGORIES.filter((c) => ["R", "HR"].includes(c.key));

const stat = (R: number, HR: number, S = 0) => ({
  R, HR, RBI: 0, SB: 0, AVG: 0.25, W: 0, S, K: 0, ERA: 4, WHIP: 1.3,
});

beforeEach(() => {
  vi.clearAllMocks();
  p.league.findUnique.mockResolvedValue({ name: "L", season: 2026, rules: {} });
  p.team.findMany.mockResolvedValue([
    { id: 1, name: "A", rosters: [] },
    { id: 2, name: "B", rosters: [] },
  ]);
  p.aiInsight.findFirst.mockResolvedValue(null);
  p.period.findFirst.mockResolvedValue({ id: 9 });
  p.roster.findMany.mockResolvedValue([]);
  (computeTeamStatsFromDb as any).mockResolvedValue([
    { team: { id: 1, name: "A", code: "AAA" }, stats: stat(50, 10) },
    { team: { id: 2, name: "B", code: "BBB" }, stats: stat(40, 5) },
  ]);
});

describe("buildDigestContext — league categories", () => {
  it("ranks only the league's categories (R, HR)", async () => {
    (getLeagueCategories as any).mockResolvedValue(RH);
    const ctx = await buildDigestContext(7, "2026-W20");
    expect(getLeagueCategories).toHaveBeenCalledWith(7);
    const keys = ctx!.teams[0].categoryRankLine.split(" ").map((s) => s.split(":")[0]);
    expect(keys).toEqual(["R", "HR"]);
    expect(ctx!.teams[0].categoryRankLine).toBe("R:1 HR:1");
    // 2 categories x 2 teams: leader gets 2 pts per category
    expect(ctx!.teams[0].totalPoints).toBe(4);
  });

  it("standard-10 league keeps all ten category ranks", async () => {
    (getLeagueCategories as any).mockResolvedValue(SCORABLE_CATEGORIES);
    const ctx = await buildDigestContext(7, "2026-W20");
    const keys = ctx!.teams[0].categoryRankLine.split(" ").map((s) => s.split(":")[0]);
    expect(keys).toEqual(["R", "HR", "RBI", "SB", "AVG", "W", "SV", "ERA", "WHIP", "K"]);
  });

  // todo #319: the stats line used to look up "S" while ranks are keyed "SV",
  // so saves never appeared.
  it("stats line includes saves (SV) for a league that scores them", async () => {
    (getLeagueCategories as any).mockResolvedValue(SCORABLE_CATEGORIES);
    (computeTeamStatsFromDb as any).mockResolvedValue([
      { team: { id: 1, name: "A", code: "AAA" }, stats: stat(50, 10, 12) },
      { team: { id: 2, name: "B", code: "BBB" }, stats: stat(40, 5, 3) },
    ]);
    const ctx = await buildDigestContext(7, "2026-W20");
    expect(ctx!.teams[0].statsLine).toContain("SV:12(1st)");
    expect(ctx!.teams[1].statsLine).toContain("SV:3(2nd)");
    expect(ctx!.teams[0].statsLine).toBe(
      "R:50(1st) HR:10(1st) RBI:0(1st) SB:0(1st) AVG:.250(1st) | W:0(1st) SV:12(1st) ERA:4.00(1st) WHIP:1.30(1st) K:0(1st)",
    );
  });

  it("subset league's stats line shows only its categories", async () => {
    (getLeagueCategories as any).mockResolvedValue(RH);
    const ctx = await buildDigestContext(7, "2026-W20");
    expect(ctx!.teams[0].statsLine).toBe("R:50(1st) HR:10(1st)");
  });
});
