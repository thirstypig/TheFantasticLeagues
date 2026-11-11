import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const openCard = vi.fn();
vi.mock("../../../components/shared/playerCard/PlayerCardProvider", () => ({
  usePlayerCard: () => ({ open: openCard, close: vi.fn() }),
  PlayerLink: ({ name }: { name: string }) => <span>{name}</span>,
}));
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1, outfieldMode: "OF" }),
}));
vi.mock("../../../api/base", () => ({
  API_BASE: "/api",
  fmtRate: (n: number) => String(n),
  fetchJsonApi: vi.fn().mockResolvedValue({
    leagueSummary: { avgHitterPrice: 10, avgPitcherPrice: 8 },
    surplusRanking: [],
    generatedAt: "2026-03-01T00:00:00Z",
    teams: [
      {
        teamId: 5, teamName: "Doyers", grade: "A", keeperAssessment: "", analysis: "", projectedStats: "",
        categoryStrengths: "", categoryWeaknesses: "", auctionSpend: 20, keeperSpend: 0, keeperCount: 0,
        avgHitterPrice: 10, avgPitcherPrice: 8, totalSurplus: 0, auctionSurplus: 0, hitterSpend: 20,
        pitcherSpend: 0, top3Pct: 0, favMlbTeam: null, bestBargain: null, worstOverpay: null, keepers: [],
        roster: [
          { playerName: "Test Hitter", position: "OF", price: 20, isKeeper: false, projectedValue: 20, surplus: 0 },
        ],
      },
    ],
  }),
}));
vi.mock("../../../api", () => ({
  getPlayerSeasonStats: vi.fn().mockResolvedValue([
    { mlb_id: "660271", player_name: "Test Hitter", positions: "OF", is_pitcher: false },
  ]),
}));
vi.mock("../../auction/components/PlayerExpandedRow", () => ({
  default: ({ player, onViewDetail }: any) => (
    <tr><td><button onClick={() => onViewDetail(player)}>view detail</button></td></tr>
  ),
}));

import DraftReportPage from "../pages/DraftReportPage";

describe("DraftReportPage player card", () => {
  it("View detail on an expanded roster row opens the card for the stats row's mlbId", async () => {
    render(<DraftReportPage />);
    fireEvent.click(await screen.findByText("Show Full Roster"));
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(await screen.findByText("Test Hitter"));
    fireEvent.click(await screen.findByRole("button", { name: "view detail" }));
    expect(openCard).toHaveBeenCalledWith(660271);
  });
});
