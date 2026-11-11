/*
 * Aurora-specific behavior tests for the AuctionValues page (PR #145).
 *
 * Scope: ONLY what Aurora adds beyond the legacy data behavior. The
 * legacy escape route (`/auction-values-classic`) was retired in #124
 * Phase 1 — Aurora is the only AuctionValues page now.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../api", () => ({
  getAuctionValues: vi.fn().mockResolvedValue([]),
  getLeague: vi.fn().mockResolvedValue({ league: { teams: [] } }),
  getPlayerSeasonStatsMeta: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../../components/shared/playerCard/PlayerCard", () => ({
  PlayerCard: ({ mlbId }: { mlbId: number }) => <div data-testid="player-card" data-mlbid={mlbId} />,
}));

vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1, outfieldMode: "OF" }),
}));


import * as api from "../../../api";
import { PlayerCardProvider } from "../../../components/shared/playerCard/PlayerCardProvider";
import AuctionValues from "../pages/AuctionValues";

beforeEach(() => {
  vi.clearAllMocks();
});

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={["/auction-values"]}>
      <PlayerCardProvider>
        <AuctionValues />
      </PlayerCardProvider>
    </MemoryRouter>,
  );
}

describe("Aurora AuctionValues", () => {
  it("renders Aurora hero copy ('Projected dollar values.')", async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /projected dollar values/i })).toBeInTheDocument();
    });
  });

  it("wraps content in the .aurora-theme container so scoped CSS tokens resolve", async () => {
    const { container } = renderWithRouter();
    await waitFor(() => {
      // Aurora atoms (Glass, IridText, AmbientBg) all rely on CSS
      // variables scoped to .aurora-theme; without this wrapper the
      // page renders unstyled. Smoke-test that the wrapper survives.
      expect(container.querySelector(".aurora-theme")).not.toBeNull();
    });
  });

  it("clicking a row opens the player card for that row's mlbId", async () => {
    vi.mocked(api.getAuctionValues).mockResolvedValueOnce([
      { mlb_id: "660271", player_name: "Test Hitter", positions: "OF", is_pitcher: false, dollar_value: 30 },
    ] as never);
    renderWithRouter();
    fireEvent.click(await screen.findByText("Test Hitter"));
    expect(screen.getByTestId("player-card")).toHaveAttribute("data-mlbid", "660271");
  });

  it("a row with no usable mlbId does not open the card", async () => {
    vi.mocked(api.getAuctionValues).mockResolvedValueOnce([
      { mlb_id: "", player_name: "No Id Guy", positions: "OF", is_pitcher: false, dollar_value: 5 },
    ] as never);
    renderWithRouter();
    fireEvent.click(await screen.findByText("No Id Guy"));
    expect(screen.queryByTestId("player-card")).toBeNull();
  });
});
