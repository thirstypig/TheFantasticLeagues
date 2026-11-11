import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../contexts/LeagueContext", () => ({ useLeague: () => ({ myTeamId: 3, leagueId: 20 }) }));
vi.mock("../api", () => ({
  getTradingBlock: vi.fn().mockResolvedValue({
    items: [
      { id: 1, askingFor: "", team: { id: 3, name: "Doyers", code: "DOY" }, player: { id: 11, name: "Mookie Betts", mlbId: 605141, posPrimary: "SS", mlbTeam: "LAD" } },
      { id: 2, askingFor: "", team: { id: 3, name: "Doyers", code: "DOY" }, player: { id: 12, name: "Minor Leaguer", mlbId: null, posPrimary: "OF", mlbTeam: null } },
    ],
  }),
  getMyTradingBlock: vi.fn().mockResolvedValue({ items: [] }),
  addToTradingBlock: vi.fn(),
  updateTradingBlockItem: vi.fn(),
  removeFromTradingBlock: vi.fn(),
}));
vi.mock("../../../components/shared/playerCard/PlayerCard", () => ({
  PlayerCard: ({ mlbId }: { mlbId: number }) => <div data-testid="player-card" data-mlbid={mlbId} />,
}));

import { PlayerCardProvider } from "../../../components/shared/playerCard/PlayerCardProvider";
import TradingBlockPanel from "../components/TradingBlockPanel";

describe("TradingBlockPanel player card", () => {
  it("tapping a name opens the card for that mlbId", async () => {
    render(
      <MemoryRouter>
        <PlayerCardProvider>
          <TradingBlockPanel leagueWide />
        </PlayerCardProvider>
      </MemoryRouter>,
    );
    fireEvent.click((await screen.findAllByRole("button", { name: "Mookie Betts" }))[0]);
    expect(screen.getByTestId("player-card")).toHaveAttribute("data-mlbid", "605141");
  });

  it("M1: a name without an mlbId is plain text, not a button", async () => {
    render(
      <MemoryRouter>
        <PlayerCardProvider>
          <TradingBlockPanel leagueWide />
        </PlayerCardProvider>
      </MemoryRouter>,
    );
    await screen.findAllByText("Minor Leaguer");
    expect(screen.queryByRole("button", { name: "Minor Leaguer" })).toBeNull();
  });
});
