import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Rules from "../Rules";
import { fetchJsonApi } from "../../../../api/base";

vi.mock("../../../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: 1, isAdmin: false } }) }));
vi.mock("../../../../contexts/LeagueContext", () => ({ useLeague: () => ({ leagueId: 20, leagues: [] }) }));
vi.mock("../../components/RulesEditor", () => ({ RulesEditor: () => null }));
vi.mock("../../../../api/base", () => ({ API_BASE: "/api", fetchJsonApi: vi.fn() }));

const rule = (id: number, key: string, value: string) => ({
  id, leagueId: 20, category: "scoring", key, value, label: key, isLocked: false,
});

function mockRules(hitting: string, pitching: string) {
  vi.mocked(fetchJsonApi).mockImplementation(async (url: string) =>
    String(url).endsWith("/rules")
      ? { rules: [rule(1, "hitting_stats", hitting), rule(2, "pitching_stats", pitching)] }
      : { league: { maxTeams: 8, entryFee: null } },
  );
}

beforeEach(() => vi.clearAllMocks());

describe("Rules page categories", () => {
  it("a league storing the old 10+10 defaults shows 5x5 and only scorable chips", async () => {
    mockRules(
      '["R","HR","RBI","SB","AVG","OPS","H","2B","3B","BB"]',
      '["W","SV","K","ERA","WHIP","QS","HLD","IP","CG","SHO"]',
    );
    render(<Rules />);
    expect(await screen.findByText("Roto (5x5)")).toBeTruthy();
    expect(screen.getByText(/all 10 categories/)).toBeTruthy();
    for (const n of ["OPS", "QS", "HLD", "2B"]) expect(screen.queryByText(n)).toBeNull();
  });

  it("a stored [] pitching half hides the pitching card and names the hitting half", async () => {
    mockRules('["R","HR","RBI","SB","AVG"]', "[]");
    render(<Rules />);
    expect(await screen.findByText("Roto (5 hitting categories)")).toBeTruthy();
    expect(screen.queryByText("Pitching")).toBeNull();
  });
});
