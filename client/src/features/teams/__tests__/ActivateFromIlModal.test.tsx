import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../transactions/api", () => ({
  ilActivate: vi.fn(),
}));

vi.mock("../../../lib/sportConfig", () => ({
  positionToSlots: (pos: string) => [pos],
}));

vi.mock("../../../lib/errorBus", () => ({
  reportError: vi.fn(),
}));

import { ilActivate } from "../../transactions/api";
import ActivateFromIlModal from "../components/ActivateFromIlModal";

const activatePlayer = {
  player_name: "Mike Trout",
  _dbPlayerId: 101,
  assignedPosition: "IL",
  posPrimary: "OF",
  positions: "OF",
};

const activeRoster = [
  activatePlayer, // IL-slotted — must be filtered OUT of drop candidates
  { player_name: "Bo Bichette", _dbPlayerId: 202, assignedPosition: "SS", posPrimary: "SS", positions: "SS" },
  { player_name: "Bryce Harper", _dbPlayerId: 303, assignedPosition: "OF", posPrimary: "OF", positions: "OF" },
  { player_name: "Ghost Entry", _dbPlayerId: 0, assignedPosition: "C", posPrimary: "C", positions: "C" }, // no dbId — filtered
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ilActivate).mockResolvedValue({ success: true, activatePlayerId: 101, dropPlayerId: 303 });
});

describe("ActivateFromIlModal", () => {
  it("excludes IL-slotted and zero-id rows from the drop dropdown", () => {
    render(
      <ActivateFromIlModal
        leagueId={1}
        teamId={10}
        activatePlayer={activatePlayer}
        activeRoster={activeRoster}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    // Only the two non-IL, non-zero-id rows become options
    expect(screen.getByRole("option", { name: /Bo Bichette/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Bryce Harper/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Mike Trout/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Ghost Entry/i })).not.toBeInTheDocument();
  });

  it("marks ineligible drop options with '(ineligible)'", () => {
    render(
      <ActivateFromIlModal
        leagueId={1}
        teamId={10}
        activatePlayer={activatePlayer}
        activeRoster={activeRoster}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    // Mike Trout is an OF → OF slot eligible; SS slot is NOT.
    const bichette = screen.getByRole("option", { name: /Bo Bichette/i }) as HTMLOptionElement;
    expect(bichette.textContent).toMatch(/ineligible/i);
    const harper = screen.getByRole("option", { name: /Bryce Harper/i }) as HTMLOptionElement;
    expect(harper.textContent).not.toMatch(/ineligible/i);
  });

  it("renders eligibility warning banner when an ineligible drop is selected", () => {
    render(
      <ActivateFromIlModal
        leagueId={1}
        teamId={10}
        activatePlayer={activatePlayer}
        activeRoster={activeRoster}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "202" } }); // Bichette → SS (ineligible)
    expect(screen.getByText(/is not eligible for the SS slot/i)).toBeInTheDocument();
  });

  it("disables submit until a drop is chosen", () => {
    render(
      <ActivateFromIlModal
        leagueId={1}
        teamId={10}
        activatePlayer={activatePlayer}
        activeRoster={activeRoster}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    const submit = screen.getByRole("button", { name: /Activate \+ Drop/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "303" } });
    expect(submit).not.toBeDisabled();
  });

  it("submits with activate + drop ids and calls onSuccess", async () => {
    const onSuccess = vi.fn();
    render(
      <ActivateFromIlModal
        leagueId={1}
        teamId={10}
        activatePlayer={activatePlayer}
        activeRoster={activeRoster}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "303" } });
    fireEvent.click(screen.getByRole("button", { name: /Activate \+ Drop/i }));
    await waitFor(() => expect(ilActivate).toHaveBeenCalledWith({
      leagueId: 1,
      teamId: 10,
      activatePlayerId: 101,
      dropPlayerId: 303,
    }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("surfaces server error when activate fails", async () => {
    vi.mocked(ilActivate).mockRejectedValueOnce({ serverMessage: "Drop player is on IL" });
    const onSuccess = vi.fn();
    render(
      <ActivateFromIlModal
        leagueId={1}
        teamId={10}
        activatePlayer={activatePlayer}
        activeRoster={activeRoster}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "303" } });
    fireEvent.click(screen.getByRole("button", { name: /Activate \+ Drop/i }));
    await waitFor(() => expect(screen.getByText(/Drop player is on IL/i)).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
