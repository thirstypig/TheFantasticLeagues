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
    expect(await screen.findByText("Los Doyers")).toBeInTheDocument();
    expect(screen.getByText("Demolition Lumber Co.")).toBeInTheDocument();
    expect(screen.getByText("Bleacher Creatures")).toBeInTheDocument();
  });

  it("highlights the user's team with a YOU badge", async () => {
    renderStandings();
    const ldy = await screen.findByText("Los Doyers");
    expect(within(ldy.parentElement!).getByText("YOU")).toBeInTheDocument();
  });

  it("switches columns when the segmented control changes view", async () => {
    renderStandings();
    await screen.findByText("Los Doyers");
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
    await screen.findByText("Los Doyers");
    const totalHeader = screen.getByRole("button", { name: /TOT/ });
    // Default sort is total/desc — click once to flip to ascending.
    fireEvent.click(totalHeader);
    expect(totalHeader.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(totalHeader);
    expect(totalHeader.getAttribute("aria-sort")).toBe("descending");
  });
});
