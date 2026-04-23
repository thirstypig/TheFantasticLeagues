import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import RosterMovesTab from "../RosterMovesTab";
import type { RosterMovesPlayer } from "../types";

// Mock the three panels — we're testing the container's mode-switching +
// count-pill behavior, not the panels themselves (those use server APIs).
vi.mock("../AddDropPanel", () => ({
  default: () => <div data-testid="add-drop-panel" />,
}));
vi.mock("../PlaceOnIlPanel", () => ({
  default: () => <div data-testid="place-on-il-panel" />,
}));
vi.mock("../ActivateFromIlPanel", () => ({
  default: () => <div data-testid="activate-from-il-panel" />,
}));

// Button component stub — real one pulls in Radix Slot + variant classes
// we don't care about here.
vi.mock("../../../../../components/ui/button", () => ({
  Button: ({ children, onClick, variant, ...props }: any) => (
    <button data-variant={variant} onClick={onClick} {...props}>{children}</button>
  ),
}));

const BASE_PROPS = {
  leagueId: 20,
  teamId: 147,
  onComplete: vi.fn(),
};

function renderTab(
  players: Partial<RosterMovesPlayer>[] = [],
  initialPath = "/activity?tab=add_drop",
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <RosterMovesTab {...BASE_PROPS} players={players as RosterMovesPlayer[]} />
    </MemoryRouter>,
  );
}

describe("RosterMovesTab — default mode + URL sync", () => {
  it("defaults to add-drop panel when no ?mode param is present", () => {
    renderTab();
    expect(screen.getByTestId("add-drop-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("place-on-il-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("activate-from-il-panel")).not.toBeInTheDocument();
  });

  it("reads ?mode=place-il from URL and renders the Place on IL panel", () => {
    renderTab([], "/activity?tab=add_drop&mode=place-il");
    expect(screen.getByTestId("place-on-il-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("add-drop-panel")).not.toBeInTheDocument();
  });

  it("reads ?mode=activate-il from URL and renders the Activate panel", () => {
    renderTab([], "/activity?tab=add_drop&mode=activate-il");
    expect(screen.getByTestId("activate-from-il-panel")).toBeInTheDocument();
  });

  it("falls back to add-drop on an invalid ?mode value — guards against template-string typos", () => {
    // This test catches regressions like `?mode=add_drop` (underscore) vs
    // `add-drop` (hyphen), which would silently render the wrong panel.
    renderTab([], "/activity?tab=add_drop&mode=not-a-real-mode");
    expect(screen.getByTestId("add-drop-panel")).toBeInTheDocument();
  });

  it("clicking a mode button switches panels and pushes to history", async () => {
    const user = userEvent.setup();
    renderTab();

    expect(screen.getByTestId("add-drop-panel")).toBeInTheDocument();
    await user.click(screen.getByText("Place on IL"));
    expect(screen.getByTestId("place-on-il-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("add-drop-panel")).not.toBeInTheDocument();
  });
});

describe("RosterMovesTab — IL count surfaces", () => {
  const makeIlPlayer = (playerId: number): Partial<RosterMovesPlayer> => ({
    _dbPlayerId: playerId,
    _dbTeamId: 147,
    assignedPosition: "IL",
    player_name: `IL Player ${playerId}`,
    posPrimary: "OF",
  });

  const makeActivePlayer = (playerId: number): Partial<RosterMovesPlayer> => ({
    _dbPlayerId: playerId,
    _dbTeamId: 147,
    assignedPosition: "OF",
    player_name: `Active Player ${playerId}`,
    posPrimary: "OF",
  });

  it("shows a count pill on the Activate tab when the team has IL players", () => {
    renderTab([makeIlPlayer(1), makeIlPlayer(2), makeActivePlayer(3)]);
    // The pill renders inside the Activate from IL button — the count is "2"
    // because only two of the three players match `teamId=147 AND IL`.
    const activateButton = screen.getByText("Activate from IL").closest("button");
    expect(activateButton).not.toBeNull();
    expect(activateButton!.textContent).toContain("2");
  });

  it("omits the count pill when no IL players exist", () => {
    renderTab([makeActivePlayer(3)]);
    const activateButton = screen.getByText("Activate from IL").closest("button");
    expect(activateButton!.textContent).not.toMatch(/\d/);
  });

  it("ignores IL players on OTHER teams — count is per-team", () => {
    // Player 99 is IL-slotted but belongs to a different team (_dbTeamId: 999).
    // Count pill should NOT count them.
    renderTab([
      makeIlPlayer(1),
      { _dbPlayerId: 99, _dbTeamId: 999, assignedPosition: "IL", player_name: "Other team IL" } as RosterMovesPlayer,
    ]);
    const activateButton = screen.getByText("Activate from IL").closest("button");
    expect(activateButton!.textContent).toContain("1");
    expect(activateButton!.textContent).not.toContain("2");
  });

  it("shows the banner shortcut when IL is populated and current mode isn't Activate", () => {
    renderTab([makeIlPlayer(1), makeIlPlayer(2)]);
    expect(screen.getByText(/2 players are currently on your IL/)).toBeInTheDocument();
    expect(screen.getByText("Activate from IL →")).toBeInTheDocument();
  });

  it("omits the banner when current mode is already Activate from IL", () => {
    renderTab([makeIlPlayer(1)], "/activity?tab=add_drop&mode=activate-il");
    expect(screen.queryByText(/currently on your IL/)).not.toBeInTheDocument();
  });

  it("pluralizes correctly for a single IL player", () => {
    renderTab([makeIlPlayer(1)]);
    expect(screen.getByText(/1 player is currently on your IL/)).toBeInTheDocument();
  });
});
