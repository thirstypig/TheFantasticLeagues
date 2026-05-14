import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileStandings } from "../pages/MobileStandings";
import { getSeasonStandings } from "../../api";
import { getPeriodCategoryStandings } from "../../api";

vi.mock("../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 20, myTeamId: 101 }),
}));

vi.mock("../../api", async () => {
  return {
    getSeasonStandings: vi.fn(),
    getPeriodCategoryStandings: vi.fn(),
  };
});

const SAMPLE_RESPONSE = {
  periodId: 7,
  teamCount: 3,
  categories: [
    {
      key: "AVG",
      label: "AVG",
      group: "H",
      higherIsBetter: true,
      rows: [
        { teamId: 101, teamCode: "LDY", teamName: "Los Doyers", value: 0.282, rank: 1, points: 9 },
        { teamId: 202, teamCode: "DLC", teamName: "Demolition Lumber Co.", value: 0.275, rank: 2, points: 7 },
        { teamId: 303, teamCode: "BCR", teamName: "Bleacher Creatures", value: 0.260, rank: 3, points: 4 },
      ],
    },
    {
      key: "HR",
      label: "HR",
      group: "H",
      higherIsBetter: true,
      rows: [
        { teamId: 101, teamCode: "LDY", teamName: "Los Doyers", value: 110, rank: 2, points: 8 },
        { teamId: 202, teamCode: "DLC", teamName: "Demolition Lumber Co.", value: 130, rank: 1, points: 10 },
        { teamId: 303, teamCode: "BCR", teamName: "Bleacher Creatures", value: 90, rank: 3, points: 5 },
      ],
    },
    {
      key: "ERA",
      label: "ERA",
      group: "P",
      higherIsBetter: false,
      rows: [
        { teamId: 101, teamCode: "LDY", teamName: "Los Doyers", value: 3.42, rank: 1, points: 10 },
        { teamId: 202, teamCode: "DLC", teamName: "Demolition Lumber Co.", value: 3.85, rank: 2, points: 7 },
        { teamId: 303, teamCode: "BCR", teamName: "Bleacher Creatures", value: 4.20, rank: 3, points: 3 },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSeasonStandings).mockResolvedValue({
    periodIds: [5, 6, 7],
    rows: [],
  } as any);
  vi.mocked(getPeriodCategoryStandings).mockResolvedValue(SAMPLE_RESPONSE as any);
});

function renderStandings() {
  return render(
    <MemoryRouter>
      <MobileStandings />
    </MemoryRouter>,
  );
}

describe("MobileStandings", () => {
  it("renders the team rows after the data resolves", async () => {
    renderStandings();
    // Team names appear in both the standings table and Category Leaders cards
    expect((await screen.findAllByText("Los Doyers")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Demolition Lumber Co.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Bleacher Creatures").length).toBeGreaterThanOrEqual(1);
  });

  it("highlights the user's team with a YOU badge", async () => {
    renderStandings();
    // Multiple "Los Doyers" elements exist (standings table + Category Leaders cards);
    // only the standings row has the YOU badge inline.
    const ldyItems = await screen.findAllByText("Los Doyers");
    const ldyWithYou = ldyItems.find((el) => within(el.parentElement!).queryByText("YOU"));
    expect(ldyWithYou).toBeDefined();
  });

  it("switches columns when the segmented control changes view", async () => {
    renderStandings();
    await screen.findAllByText("Los Doyers"); // wait for data
    // Hitting view: AVG header should be visible.
    expect(screen.getByRole("tab", { name: "Hitting", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /AVG/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Pitching" }));
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Pitching", selected: true })).toBeInTheDocument();
    });
    // Pitching view: ERA header should now be visible.
    expect(screen.getByRole("button", { name: /ERA/ })).toBeInTheDocument();
  });

  it("toggles sort direction when the same column header is clicked twice", async () => {
    renderStandings();
    await screen.findAllByText("Los Doyers"); // wait for data
    const totalHeader = screen.getByRole("button", { name: /TOT/ });
    // Default sort is total/desc — click once to flip to ascending.
    fireEvent.click(totalHeader);
    expect(totalHeader.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(totalHeader);
    expect(totalHeader.getAttribute("aria-sort")).toBe("descending");
  });

  // ── Category leaders ──────────────────────────────────────────────────

  it("renders the Category Leaders section after data loads", async () => {
    renderStandings();
    expect(await screen.findByText("Category Leaders")).toBeInTheDocument();
  });

  it("shows a card per category with the category key as label", async () => {
    renderStandings();
    await screen.findByText("Category Leaders");
    // Three categories in SAMPLE_RESPONSE: AVG, HR, ERA
    expect(screen.getAllByText("AVG").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("HR").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ERA").length).toBeGreaterThanOrEqual(1);
  });

  it("displays top-3 teams with actual stat values for each category", async () => {
    renderStandings();
    await screen.findByText("Category Leaders");
    // AVG leader: Los Doyers at .282
    expect(screen.getByText(".282")).toBeInTheDocument();
    // HR leader: Demolition Lumber Co. at 130
    expect(screen.getByText("130")).toBeInTheDocument();
    // ERA leader: Los Doyers at 3.42
    expect(screen.getByText("3.42")).toBeInTheDocument();
  });

  it("shows rank numbers 1–3 inside each category card", async () => {
    renderStandings();
    await screen.findByText("Category Leaders");
    // Multiple "1", "2", "3" rank cells should appear (one set per category)
    const ones = screen.getAllByText("1");
    expect(ones.length).toBeGreaterThanOrEqual(3); // one per category card
  });
});
