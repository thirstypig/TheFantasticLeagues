import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import DropFromIlPanel from "../DropFromIlPanel";
import type { RosterMovesPlayer } from "../types";

vi.mock("../../../../transactions/api", () => ({
  drop: vi.fn(),
}));

import * as api from "../../../../transactions/api";

const IL_PLAYER: RosterMovesPlayer = {
  player_name: "Julio Rodríguez",
  _dbPlayerId: 77,
  _dbTeamId: 5,
  assignedPosition: "IL",
  posList: "CF,OF",
  posPrimary: "CF",
  isFreeAgent: () => false,
};

const ACTIVE_PLAYER: RosterMovesPlayer = {
  player_name: "Cal Raleigh",
  _dbPlayerId: 88,
  _dbTeamId: 5,
  assignedPosition: "C",
  posList: "C",
  posPrimary: "C",
  isFreeAgent: () => false,
};

const DEFAULT_PROPS = {
  leagueId: 20,
  teamId: 5,
  players: [IL_PLAYER, ACTIVE_PLAYER],
  onComplete: vi.fn(),
};

describe("DropFromIlPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the IL player name when pre-selected via initialReleasePlayerId", () => {
    render(<DropFromIlPanel {...DEFAULT_PROPS} initialReleasePlayerId={77} />);
    const playerOption = screen.getByRole("option", { name: /Julio Rodríguez/i });
    expect(playerOption).toHaveAttribute("value", "77");
  });

  it("disables the Release button when no player is selected", () => {
    render(<DropFromIlPanel {...DEFAULT_PROPS} />);
    expect(screen.getByRole("button", { name: /release/i })).toBeDisabled();
  });

  it("enables the Release button when an IL player is selected", () => {
    render(<DropFromIlPanel {...DEFAULT_PROPS} initialReleasePlayerId={77} />);
    expect(screen.getByRole("button", { name: /release/i })).not.toBeDisabled();
  });

  it("calls drop() and onComplete on successful submit", async () => {
    vi.mocked(api.drop).mockResolvedValueOnce({ success: true, playerId: 77 });

    const { onComplete } = DEFAULT_PROPS;
    render(<DropFromIlPanel {...DEFAULT_PROPS} initialReleasePlayerId={77} />);
    fireEvent.click(screen.getByRole("button", { name: /release/i }));

    await waitFor(() => {
      expect(api.drop).toHaveBeenCalledWith({
        leagueId: 20,
        teamId: 5,
        playerId: 77,
      });
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it("shows error message when drop() rejects", async () => {
    vi.mocked(api.drop).mockRejectedValueOnce(new Error("Player not on roster"));

    render(<DropFromIlPanel {...DEFAULT_PROPS} initialReleasePlayerId={77} />);
    fireEvent.click(screen.getByRole("button", { name: /release/i }));

    await waitFor(() => {
      expect(screen.getByText(/Player not on roster/i)).toBeInTheDocument();
    });
  });

  it("only shows IL-slotted players in the dropdown", () => {
    render(<DropFromIlPanel {...DEFAULT_PROPS} />);
    const options = screen.queryAllByRole("option");
    const names = options.map((o) => o.textContent);
    expect(names.some((n) => n?.includes("Cal Raleigh"))).toBe(false);
    expect(names.some((n) => n?.includes("Julio Rodríguez"))).toBe(true);
  });

  it("passes effectiveDate when provided", async () => {
    vi.mocked(api.drop).mockResolvedValueOnce({ success: true, playerId: 77 });

    render(<DropFromIlPanel {...DEFAULT_PROPS} initialReleasePlayerId={77} effectiveDate="2026-05-01" />);
    fireEvent.click(screen.getByRole("button", { name: /release/i }));

    await waitFor(() => {
      expect(api.drop).toHaveBeenCalledWith(
        expect.objectContaining({ effectiveDate: "2026-05-01" })
      );
    });
  });
});
