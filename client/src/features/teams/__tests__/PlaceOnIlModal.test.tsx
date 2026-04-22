import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../transactions/api", () => ({
  ilStash: vi.fn(),
}));

vi.mock("../../../lib/sportConfig", () => ({
  // Minimal stub: return the position as its own slot. The component's
  // slotsFor helper splits on /,|/| and feeds each part here, so "OF/1B"
  // produces a set of {"OF", "1B"}.
  positionToSlots: (pos: string) => [pos],
}));

vi.mock("../../../lib/errorBus", () => ({
  reportError: vi.fn(),
}));

import { ilStash } from "../../transactions/api";
import PlaceOnIlModal from "../components/PlaceOnIlModal";

const stashPlayer = {
  player_name: "Shohei Ohtani",
  _dbPlayerId: 501,
  assignedPosition: "OF",
  posPrimary: "OF",
  mlbStatus: "Injured 10-Day",
};

const freeAgentFits = {
  player_name: "Alek Thomas",
  mlb_id: 777,
  positions: "OF",
};

const freeAgentMisfit = {
  player_name: "Bo Bichette",
  mlb_id: 888,
  positions: "SS",
};

const rosteredAlreadyTaken = {
  player_name: "Aaron Judge",
  mlb_id: 999,
  positions: "OF",
  ogba_team_code: "TEAM_B",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ilStash).mockResolvedValue({ success: true, stashPlayerId: 501, addPlayerId: 777 });
});

describe("PlaceOnIlModal", () => {
  it("renders the stash player and target slot in the header", () => {
    render(
      <PlaceOnIlModal
        leagueId={1}
        teamId={10}
        stashPlayer={stashPlayer}
        playerPool={[freeAgentFits]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(screen.getByText(/Place on IL/i)).toBeInTheDocument();
    expect(screen.getByText("Shohei Ohtani")).toBeInTheDocument();
    // Vacated slot appears in the header description sentence.
    expect(screen.getByText(/vacated/i)).toBeInTheDocument();
  });

  it("filters out rostered players from the free-agent list", () => {
    render(
      <PlaceOnIlModal
        leagueId={1}
        teamId={10}
        stashPlayer={stashPlayer}
        playerPool={[freeAgentFits, rosteredAlreadyTaken]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(screen.getByText("Alek Thomas")).toBeInTheDocument();
    expect(screen.queryByText("Aaron Judge")).not.toBeInTheDocument();
  });

  it("flags ineligible candidates inline in the picker", () => {
    render(
      <PlaceOnIlModal
        leagueId={1}
        teamId={10}
        stashPlayer={stashPlayer}
        playerPool={[freeAgentFits, freeAgentMisfit]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(screen.getByText(/not eligible for OF/i)).toBeInTheDocument();
  });

  it("shows eligibility warning banner when an ineligible player is selected", () => {
    render(
      <PlaceOnIlModal
        leagueId={1}
        teamId={10}
        stashPlayer={stashPlayer}
        playerPool={[freeAgentMisfit]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Bo Bichette"));
    expect(screen.getByText(/is not eligible for the OF slot/i)).toBeInTheDocument();
  });

  it("warns when the stash player's MLB status is not an Injured N-Day designation", () => {
    render(
      <PlaceOnIlModal
        leagueId={1}
        teamId={10}
        stashPlayer={{ ...stashPlayer, mlbStatus: "Active" }}
        playerPool={[freeAgentFits]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(screen.getByText(/server requires an active Injured-List designation/i)).toBeInTheDocument();
  });

  it("disables submit until a replacement is selected", () => {
    render(
      <PlaceOnIlModal
        leagueId={1}
        teamId={10}
        stashPlayer={stashPlayer}
        playerPool={[freeAgentFits]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    const submit = screen.getByRole("button", { name: /Stash \+ Add/i });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByText("Alek Thomas"));
    expect(submit).not.toBeDisabled();
  });

  it("submits with addMlbId and calls onSuccess on success", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(
      <PlaceOnIlModal
        leagueId={1}
        teamId={10}
        stashPlayer={stashPlayer}
        playerPool={[freeAgentFits]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
    fireEvent.click(screen.getByText("Alek Thomas"));
    fireEvent.click(screen.getByRole("button", { name: /Stash \+ Add/i }));
    await waitFor(() => expect(ilStash).toHaveBeenCalledWith({
      leagueId: 1,
      teamId: 10,
      stashPlayerId: 501,
      addMlbId: 777,
    }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("surfaces server error text and does not call onSuccess", async () => {
    vi.mocked(ilStash).mockRejectedValueOnce({ serverMessage: "Team has ghost-IL player" });
    const onSuccess = vi.fn();
    render(
      <PlaceOnIlModal
        leagueId={1}
        teamId={10}
        stashPlayer={stashPlayer}
        playerPool={[freeAgentFits]}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />
    );
    fireEvent.click(screen.getByText("Alek Thomas"));
    fireEvent.click(screen.getByRole("button", { name: /Stash \+ Add/i }));
    await waitFor(() => expect(screen.getByText(/ghost-IL player/i)).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("Cancel invokes onClose without touching the API", () => {
    const onClose = vi.fn();
    render(
      <PlaceOnIlModal
        leagueId={1}
        teamId={10}
        stashPlayer={stashPlayer}
        playerPool={[freeAgentFits]}
        onClose={onClose}
        onSuccess={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(ilStash).not.toHaveBeenCalled();
  });
});
