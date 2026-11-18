import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    teamStatsPeriod: { findUnique: vi.fn() },
    period: { findUnique: vi.fn() },
  },
}));
vi.mock("../../../lib/leagueCategories.js", async () => {
  const a = await vi.importActual<any>("../../../lib/leagueCategories.js");
  return { ...a, getLeagueCategories: vi.fn().mockResolvedValue(a.SCORABLE_CATEGORIES) };
});

import { prisma } from "../../../db/prisma.js";
import { getLeagueCategories, SCORABLE_CATEGORIES } from "../../../lib/leagueCategories.js";
import { scoreH2HCategories } from "../services/matchupScoring.js";

const p = prisma as any;
const A = { R: 10, HR: 1, RBI: 5, SB: 5, AVG: 0.25, W: 3, S: 5, K: 40, ERA: 3.5, WHIP: 1.1 };
const B = { R: 5, HR: 4, RBI: 5, SB: 1, AVG: 0.3, W: 1, S: 2, K: 50, ERA: 4.5, WHIP: 1.3 };

beforeEach(() => {
  vi.clearAllMocks();
  p.period.findUnique.mockResolvedValue({ leagueId: 7 });
  p.teamStatsPeriod.findUnique.mockImplementation(({ where }: any) =>
    Promise.resolve(where.teamId_periodId.teamId === 1 ? A : B));
  (getLeagueCategories as any).mockResolvedValue(SCORABLE_CATEGORIES);
});

describe("scoreH2HCategories — league categories", () => {
  it("scores only the league's categories (R, HR)", async () => {
    (getLeagueCategories as any).mockResolvedValue(
      SCORABLE_CATEGORIES.filter((c) => ["R", "HR"].includes(c.key)),
    );
    const r = await scoreH2HCategories(1, 2, 9);
    expect(getLeagueCategories).toHaveBeenCalledWith(7);
    expect(r.categories.map((c) => c.stat)).toEqual(["R", "HR"]);
    expect(r.teamA.catWins + r.teamA.catLosses + r.teamA.catTies).toBe(2);
  });

  it("standard-10: historical order, saves read from S, ERA lower wins", async () => {
    const r = await scoreH2HCategories(1, 2, 9);
    expect(r.categories.map((c) => c.stat)).toEqual(
      ["R", "HR", "RBI", "SB", "AVG", "W", "SV", "K", "ERA", "WHIP"],
    );
    const by = Object.fromEntries(r.categories.map((c) => [c.stat, c]));
    expect(by.SV.teamAVal).toBe(5);
    expect(by.ERA.winner).toBe("A");
    expect(by.RBI.winner).toBe("TIE");
    expect(r.teamA).toMatchObject({ catWins: 6, catLosses: 3, catTies: 1 });
  });
});
