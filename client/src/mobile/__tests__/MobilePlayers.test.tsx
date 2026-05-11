import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobilePlayers } from "../pages/MobilePlayers";
import { getPlayerSeasonStatsMeta } from "../../api";

vi.mock("../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 20 }),
}));

vi.mock("../../api", () => ({
  getPlayerSeasonStatsMeta: vi.fn(),
}));

const HITTERS = [
  { id: 1, mlb_id: "100", player_name: "Aaron Judge", mlb_team_abbr: "NYY", positions: "OF", posPrimary: "OF", is_pitcher: false, AVG: 0.31, HR: 50, RBI: 110, SB: 5 },
  { id: 2, mlb_id: "200", player_name: "Mookie Betts", mlb_team_abbr: "LAD", positions: "OF,2B", posPrimary: "OF", is_pitcher: false, AVG: 0.305, HR: 30, RBI: 90, SB: 12 },
  { id: 3, mlb_id: "300", player_name: "Marcus Semien", mlb_team_abbr: "TEX", positions: "2B", posPrimary: "2B", is_pitcher: false, AVG: 0.276, HR: 28, RBI: 100, SB: 14 },
];
const PITCHERS = [
  { id: 10, mlb_id: "1000", player_name: "Spencer Strider", mlb_team_abbr: "ATL", positions: "SP", posPrimary: "SP", is_pitcher: true, W: 18, K: 280, ERA: 2.85, WHIP: 1.05 },
  { id: 11, mlb_id: "1100", player_name: "Edwin Diaz", mlb_team_abbr: "NYM", positions: "RP", posPrimary: "RP", is_pitcher: true, W: 4, K: 100, ERA: 1.95, WHIP: 0.85 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPlayerSeasonStatsMeta).mockResolvedValue({
    stats: [...HITTERS, ...PITCHERS],
  } as any);
});

function renderPage(initialPath = "/players?team=ALL") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <MobilePlayers />
    </MemoryRouter>,
  );
}

describe("MobilePlayers", () => {
  it("renders the hitter list with hitter stats by default", async () => {
    renderPage();
    expect(await screen.findByText("Aaron Judge")).toBeInTheDocument();
    // HR header should be present (hitters)
    expect(screen.getByRole("button", { name: /HR/ })).toBeInTheDocument();
    // No pitcher (Strider) since group=Hitters
    expect(screen.queryByText("Spencer Strider")).not.toBeInTheDocument();
  });

  it("filters to NL when the NL chip is active", async () => {
    renderPage("/players?team=ALL_NL");
    await screen.findByText("Mookie Betts"); // LAD is NL
    expect(screen.queryByText("Aaron Judge")).not.toBeInTheDocument(); // NYY is AL
  });

  it("filters by position chip", async () => {
    renderPage();
    await screen.findByText("Aaron Judge");
    fireEvent.click(screen.getByRole("button", { name: "2B" }));
    await waitFor(() => {
      expect(screen.queryByText("Aaron Judge")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Marcus Semien")).toBeInTheDocument();
  });

  it("switches to pitchers and shows pitcher stat columns", async () => {
    renderPage();
    await screen.findByText("Aaron Judge");
    fireEvent.click(screen.getByRole("tab", { name: "Pitchers" }));
    await screen.findByText("Spencer Strider");
    expect(screen.getByRole("button", { name: /WHIP/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^HR$/ })).not.toBeInTheDocument();
  });

  it("filters players by search query", async () => {
    renderPage();
    await screen.findByText("Aaron Judge");
    const search = screen.getByTestId("mobile-players-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "betts" } });
    await waitFor(() => {
      expect(screen.queryByText("Aaron Judge")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Mookie Betts")).toBeInTheDocument();
  });

  it("toggles sort direction when clicking the same column header", async () => {
    renderPage();
    await screen.findByText("Aaron Judge");
    const hrHeader = screen.getByRole("button", { name: /HR/ });
    expect(hrHeader.getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(hrHeader);
    await waitFor(() => {
      expect(hrHeader.getAttribute("aria-sort")).toBe("ascending");
    });
  });
});
