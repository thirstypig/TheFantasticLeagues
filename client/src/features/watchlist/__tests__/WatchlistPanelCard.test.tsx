import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../contexts/LeagueContext", () => ({ useLeague: () => ({ myTeamId: 3, leagueId: 20 }) }));
vi.mock("../api", () => ({
  getWatchlist: vi.fn().mockResolvedValue({
    items: [
      { id: 1, note: "", tags: [], player: { id: 11, name: "Mookie Betts", mlbId: 605141, posPrimary: "SS", mlbTeam: "LAD" } },
      { id: 2, note: "", tags: [], player: { id: 12, name: "Minor Leaguer", mlbId: null, posPrimary: "OF", mlbTeam: null } },
    ],
  }),
  addToWatchlist: vi.fn(),
  updateWatchlistItem: vi.fn(),
  removeFromWatchlist: vi.fn(),
}));
vi.mock("../../../components/shared/playerCard/PlayerCard", () => ({
  PlayerCard: ({ mlbId }: { mlbId: number }) => <div data-testid="player-card" data-mlbid={mlbId} />,
}));

import { PlayerCardProvider } from "../../../components/shared/playerCard/PlayerCardProvider";
import WatchlistPanel from "../components/WatchlistPanel";

describe("WatchlistPanel player card", () => {
  it("tapping a name opens the card for that mlbId; a row without mlbId is plain text", async () => {
    render(
      <MemoryRouter>
        <PlayerCardProvider>
          <WatchlistPanel teamId={3} />
        </PlayerCardProvider>
      </MemoryRouter>,
    );
    await screen.findByText("Minor Leaguer");
    // M1: a name without an mlbId is plain text, not a dead button.
    expect(screen.queryByRole("button", { name: "Minor Leaguer" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mookie Betts" }));
    expect(screen.getByTestId("player-card")).toHaveAttribute("data-mlbid", "605141");
  });
});

// Compact card layout (no desktop horizontal scroll, 2026-11-18): a closed row
// shows only the tags it has; "+ tag" opens all three toggles for that row.
describe("WatchlistPanel tags in the compact card", () => {
  it("hides unselected tags until '+ tag' is tapped", async () => {
    render(
      <MemoryRouter>
        <PlayerCardProvider>
          <WatchlistPanel teamId={3} />
        </PlayerCardProvider>
      </MemoryRouter>,
    );
    await screen.findByText("Minor Leaguer");
    expect(screen.queryByRole("button", { name: "trade-target" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "+ tag" })[0]);
    expect(screen.getAllByRole("button", { name: "trade-target" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "done" })).toHaveAttribute("aria-expanded", "true");
    // No horizontal-scroll wrapper or 600px floor left on the watchlist table.
    expect(screen.getByRole("table", { name: "Watchlist" }).className).not.toContain("min-w-");
  });
});
