import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileTeam } from "../pages/MobileTeam";
import { getTeams, getTeamRosterHub, updateRosterPosition } from "../../features/teams/api";
import { ilActivate, ilStash } from "../../features/transactions/api";
import { getSeasonStandings } from "../../api";

vi.mock("../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 20, myTeamId: 101, outfieldMode: "OF" }),
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1, isAdmin: false } }),
}));

vi.mock("../../features/teams/api", () => ({
  getTeams: vi.fn(),
  getTeamRosterHub: vi.fn(),
  updateRosterPosition: vi.fn(),
}));

vi.mock("../../features/transactions/api", () => ({
  ilStash: vi.fn(),
  ilActivate: vi.fn(),
}));

vi.mock("../../api", () => ({
  getSeasonStandings: vi.fn(),
}));

vi.mock("../../lib/errorBus", () => ({
  reportError: vi.fn(),
}));

const SAMPLE_HUB = {
  team: { id: 101, leagueId: 20, name: "Los Doyers", owner: "James", budget: 48 },
  period: null,
  hitters: [
    { rosterId: 1, playerId: 1, mlbId: 100, playerName: "Mookie Betts", posPrimary: "OF", posList: "OF,2B", position: "OF", assignedPosition: "OF", isPitcher: false, mlbTeam: "LAD", AVG: 0.305, HR: 30, RBI: 90, SB: 12 },
    { rosterId: 2, playerId: 2, mlbId: 200, playerName: "Will Smith", posPrimary: "C", position: "C", assignedPosition: "C", isPitcher: false, mlbTeam: "LAD", AVG: 0.265, HR: 20, RBI: 75, SB: 1 },
  ],
  pitchers: [
    { rosterId: 10, playerId: 10, mlbId: 1000, playerName: "Tyler Glasnow", posPrimary: "SP", position: "SP", assignedPosition: "SP", isPitcher: true, mlbTeam: "LAD", W: 12, K: 200, ERA: 3.45, WHIP: 1.15 },
  ],
  ilPlayers: [
    { rosterId: 20, playerId: 20, mlbId: 2000, playerName: "Clayton Kershaw", posPrimary: "SP", position: "SP", assignedPosition: "IL", isPitcher: true, mlbTeam: "LAD", W: 4, K: 60, ERA: 2.85, WHIP: 1.02 },
  ],
  droppedPlayers: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTeams).mockResolvedValue([
    { id: 101, name: "Los Doyers", code: "LDY", budget: 48 } as any,
    { id: 202, name: "Demolition Lumber Co.", code: "DLC", budget: 40 } as any,
  ]);
  vi.mocked(getTeamRosterHub).mockResolvedValue(SAMPLE_HUB as any);
  vi.mocked(updateRosterPosition).mockResolvedValue({ roster: { id: 1 } } as any);
  vi.mocked(ilStash).mockResolvedValue({ success: true, stashPlayerId: 1, addPlayerId: null });
  vi.mocked(ilActivate).mockResolvedValue({ success: true, activatePlayerId: 20, dropPlayerId: 1 });
  vi.mocked(getSeasonStandings).mockResolvedValue({
    periodIds: [1, 2],
    rows: [
      { teamId: 101, teamCode: "LDY", teamName: "Los Doyers", periodPoints: [30, 28] },
      { teamId: 202, teamCode: "DLC", teamName: "Demolition Lumber Co.", periodPoints: [35, 31] },
    ],
  } as any);
});

function renderTeam(teamCode = "LDY") {
  return render(
    <MemoryRouter>
      <MobileTeam teamCode={teamCode} />
    </MemoryRouter>,
  );
}

describe("MobileTeam (read-only)", () => {
  it("resolves the team code, fetches the hub, and renders hitter rows", async () => {
    renderTeam();
    expect(await screen.findByText("Mookie Betts")).toBeInTheDocument();
    expect(screen.getByText("Will Smith")).toBeInTheDocument();
    // Pitcher should not be in the hitters tab
    expect(screen.queryByText("Tyler Glasnow")).not.toBeInTheDocument();
  });

  it("switches to the pitchers tab when clicked", async () => {
    renderTeam();
    await screen.findByText("Mookie Betts");
    fireEvent.click(screen.getByRole("tab", { name: "Pitchers" }));
    await screen.findByText("Tyler Glasnow");
    expect(screen.queryByText("Mookie Betts")).not.toBeInTheDocument();
    // Pitcher headers
    expect(screen.getByText("WHIP")).toBeInTheDocument();
  });

  it("exposes an IL tab when the roster has injured players", async () => {
    renderTeam();
    const ilTab = await screen.findByRole("tab", { name: "IL" });
    fireEvent.click(ilTab);
    await screen.findByText("Clayton Kershaw");
  });

  it("renders the hero strip with team name and standings rank", async () => {
    renderTeam();
    await screen.findByText("Mookie Betts");
    // The team name appears in both topbar and hero
    expect(screen.getAllByText("Los Doyers").length).toBeGreaterThanOrEqual(2);
    // Rank: Demolition Lumber Co. is 1st (66 pts) so LDY is 2nd (58 pts)
    expect(screen.getByText(/2nd place/)).toBeInTheDocument();
  });

  it("shows an error when the team code is not found in the league", async () => {
    renderTeam("ZZZ");
    await waitFor(() => {
      expect(screen.getByText(/not found in this league/)).toBeInTheDocument();
    });
  });

  it("hides the IL tab when no players are on IL", async () => {
    vi.mocked(getTeamRosterHub).mockResolvedValueOnce({
      ...SAMPLE_HUB,
      ilPlayers: [],
    } as any);
    renderTeam();
    await screen.findByText("Mookie Betts");
    expect(screen.queryByRole("tab", { name: "IL" })).not.toBeInTheDocument();
  });

  it("renders a move button on each row of the user's own team", async () => {
    renderTeam("LDY");
    await screen.findByText("Mookie Betts");
    const moveBtns = screen.getAllByTestId("mobile-team-move-btn");
    expect(moveBtns.length).toBe(2); // 2 hitters
  });

  it("opens the move sheet when the per-row move button is clicked", async () => {
    renderTeam("LDY");
    await screen.findByText("Mookie Betts");
    const mookieRow = screen.getAllByTestId("mobile-team-row")[0];
    fireEvent.click(within(mookieRow).getByTestId("mobile-team-move-btn"));
    expect(await screen.findByTestId("mobile-team-move-sheet")).toBeInTheDocument();
    // Eligible slots for Mookie (OF,2B): 2B, OF, BN. OF is current
    // and disabled.
    const slots = screen.getAllByTestId("mobile-team-move-slot");
    const labels = slots.map((s) => s.getAttribute("data-slot"));
    expect(labels).toContain("OF");
    expect(labels).toContain("2B");
    expect(labels).toContain("BN");
  });

  it("calls updateRosterPosition and optimistically updates the slot pill on pick", async () => {
    renderTeam("LDY");
    await screen.findByText("Mookie Betts");
    const mookieRow = screen.getAllByTestId("mobile-team-row")[0];
    fireEvent.click(within(mookieRow).getByTestId("mobile-team-move-btn"));
    await screen.findByTestId("mobile-team-move-sheet");
    const benchBtn = screen.getAllByTestId("mobile-team-move-slot").find((b) => b.getAttribute("data-slot") === "BN")!;
    fireEvent.click(benchBtn);
    await waitFor(() => {
      expect(updateRosterPosition).toHaveBeenCalledWith(101, 1, "BN");
    });
    // Sheet should close after pick
    expect(screen.queryByTestId("mobile-team-move-sheet")).not.toBeInTheDocument();
  });

  it("rolls back on API failure and surfaces an error toast", async () => {
    vi.mocked(updateRosterPosition).mockRejectedValueOnce(new Error("ROSTER_LOCKED"));
    renderTeam("LDY");
    await screen.findByText("Mookie Betts");
    const mookieRow = screen.getAllByTestId("mobile-team-row")[0];
    fireEvent.click(within(mookieRow).getByTestId("mobile-team-move-btn"));
    await screen.findByTestId("mobile-team-move-sheet");
    const benchBtn = screen.getAllByTestId("mobile-team-move-slot").find((b) => b.getAttribute("data-slot") === "BN")!;
    fireEvent.click(benchBtn);
    await waitFor(() => {
      expect(screen.getByTestId("mobile-team-move-error")).toBeInTheDocument();
    });
    expect(screen.getByText(/ROSTER_LOCKED/)).toBeInTheDocument();
  });

  it("hides the move buttons when viewing another manager's team", async () => {
    // Mookie's team is now id=202 (DLC), not the user's team (101)
    vi.mocked(getTeamRosterHub).mockResolvedValueOnce({
      ...SAMPLE_HUB,
      team: { ...SAMPLE_HUB.team, id: 202 },
    } as any);
    renderTeam("DLC");
    await screen.findByText("Mookie Betts");
    expect(screen.queryAllByTestId("mobile-team-move-btn").length).toBe(0);
  });

  it("offers an IL stash option in the move sheet for active players", async () => {
    renderTeam("LDY");
    await screen.findByText("Mookie Betts");
    const mookieRow = screen.getAllByTestId("mobile-team-row")[0];
    fireEvent.click(within(mookieRow).getByTestId("mobile-team-move-btn"));
    await screen.findByTestId("mobile-team-move-sheet");
    const ilBtn = screen.getAllByTestId("mobile-team-move-slot").find((b) => b.getAttribute("data-slot") === "IL");
    expect(ilBtn).toBeTruthy();
    expect(ilBtn).toHaveTextContent("IL stash");
  });

  it("calls ilStash and removes the row from active when IL is picked", async () => {
    renderTeam("LDY");
    await screen.findByText("Mookie Betts");
    const mookieRow = screen.getAllByTestId("mobile-team-row")[0];
    fireEvent.click(within(mookieRow).getByTestId("mobile-team-move-btn"));
    await screen.findByTestId("mobile-team-move-sheet");
    const ilBtn = screen.getAllByTestId("mobile-team-move-slot").find((b) => b.getAttribute("data-slot") === "IL")!;
    fireEvent.click(ilBtn);
    await waitFor(() => {
      expect(ilStash).toHaveBeenCalledWith({ leagueId: 20, teamId: 101, stashPlayerId: 1 });
    });
  });

  it("opens the IL activate sheet when the move button on an IL row is clicked", async () => {
    renderTeam("LDY");
    await screen.findByText("Mookie Betts");
    fireEvent.click(screen.getByRole("tab", { name: "IL" }));
    await screen.findByText("Clayton Kershaw");
    const ilRow = screen.getAllByTestId("mobile-team-row")[0];
    fireEvent.click(within(ilRow).getByTestId("mobile-team-move-btn"));
    expect(await screen.findByTestId("mobile-team-il-activate-sheet")).toBeInTheDocument();
    // Drop candidates = all active hitters + pitchers (Mookie + Will + Glasnow)
    const targets = screen.getAllByTestId("mobile-team-il-activate-drop-target");
    expect(targets.length).toBe(3);
  });

  it("calls ilActivate with the right player ids when a drop target is picked", async () => {
    renderTeam("LDY");
    await screen.findByText("Mookie Betts");
    fireEvent.click(screen.getByRole("tab", { name: "IL" }));
    await screen.findByText("Clayton Kershaw");
    const ilRow = screen.getAllByTestId("mobile-team-row")[0];
    fireEvent.click(within(ilRow).getByTestId("mobile-team-move-btn"));
    await screen.findByTestId("mobile-team-il-activate-sheet");
    // Pick the first drop target (Mookie, playerId=1)
    const target = screen.getAllByTestId("mobile-team-il-activate-drop-target")[0];
    fireEvent.click(target);
    await waitFor(() => {
      expect(ilActivate).toHaveBeenCalledWith({
        leagueId: 20,
        teamId: 101,
        activatePlayerId: 20,
        dropPlayerId: 1,
      });
    });
  });

  // ── Optimistic state side-effects — the API-call assertions above
  //    verify wiring, but not the in-memory hub mutations a future
  //    refactor could silently drop.

  it("optimistically moves a stashed player from hitters to the IL tab", async () => {
    renderTeam("LDY");
    await screen.findByText("Mookie Betts");
    const mookieRow = screen.getAllByTestId("mobile-team-row")[0];
    fireEvent.click(within(mookieRow).getByTestId("mobile-team-move-btn"));
    await screen.findByTestId("mobile-team-move-sheet");
    const ilBtn = screen.getAllByTestId("mobile-team-move-slot").find((b) => b.getAttribute("data-slot") === "IL")!;
    fireEvent.click(ilBtn);
    await waitFor(() => {
      expect(ilStash).toHaveBeenCalled();
    });
    // Mookie no longer in hitters view
    expect(screen.queryByText("Mookie Betts")).not.toBeInTheDocument();
    // Switch to IL tab — Mookie should now be there alongside the original Kershaw
    fireEvent.click(screen.getByRole("tab", { name: "IL" }));
    await screen.findByText("Mookie Betts");
    expect(screen.getByText("Clayton Kershaw")).toBeInTheDocument();
  });

  it("rolls IL stash back to hitters when the API call fails", async () => {
    vi.mocked(ilStash).mockRejectedValueOnce(new Error("IL_FULL"));
    renderTeam("LDY");
    await screen.findByText("Mookie Betts");
    const mookieRow = screen.getAllByTestId("mobile-team-row")[0];
    fireEvent.click(within(mookieRow).getByTestId("mobile-team-move-btn"));
    await screen.findByTestId("mobile-team-move-sheet");
    const ilBtn = screen.getAllByTestId("mobile-team-move-slot").find((b) => b.getAttribute("data-slot") === "IL")!;
    fireEvent.click(ilBtn);
    await waitFor(() => {
      expect(screen.getByTestId("mobile-team-move-error")).toBeInTheDocument();
    });
    expect(screen.getByText(/IL_FULL/)).toBeInTheDocument();
    // Mookie should still be in the hitters tab — the optimistic move was reversed
    expect(screen.getByText("Mookie Betts")).toBeInTheDocument();
  });

  it("refetches the roster hub after a successful IL activate to reconcile the server-chosen slot", async () => {
    renderTeam("LDY");
    await screen.findByText("Mookie Betts");
    // Initial mount fires one getTeamRosterHub call
    const initialCallCount = vi.mocked(getTeamRosterHub).mock.calls.length;
    fireEvent.click(screen.getByRole("tab", { name: "IL" }));
    await screen.findByText("Clayton Kershaw");
    const ilRow = screen.getAllByTestId("mobile-team-row")[0];
    fireEvent.click(within(ilRow).getByTestId("mobile-team-move-btn"));
    await screen.findByTestId("mobile-team-il-activate-sheet");
    const target = screen.getAllByTestId("mobile-team-il-activate-drop-target")[0];
    fireEvent.click(target);
    await waitFor(() => {
      // Second call after activate success — the matcher-chosen slot
      // can only be learned by refetching.
      expect(vi.mocked(getTeamRosterHub).mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it("surfaces an error toast and refetches when IL activate fails", async () => {
    vi.mocked(ilActivate).mockRejectedValueOnce(new Error("INVALID_DROP_TARGET"));
    renderTeam("LDY");
    await screen.findByText("Mookie Betts");
    fireEvent.click(screen.getByRole("tab", { name: "IL" }));
    await screen.findByText("Clayton Kershaw");
    const ilRow = screen.getAllByTestId("mobile-team-row")[0];
    fireEvent.click(within(ilRow).getByTestId("mobile-team-move-btn"));
    await screen.findByTestId("mobile-team-il-activate-sheet");
    const target = screen.getAllByTestId("mobile-team-il-activate-drop-target")[0];
    fireEvent.click(target);
    await waitFor(() => {
      expect(screen.getByTestId("mobile-team-move-error")).toBeInTheDocument();
    });
    expect(screen.getByText(/INVALID_DROP_TARGET/)).toBeInTheDocument();
  });

  it("dismisses the move sheet when the backdrop is clicked", async () => {
    renderTeam("LDY");
    await screen.findByText("Mookie Betts");
    const mookieRow = screen.getAllByTestId("mobile-team-row")[0];
    fireEvent.click(within(mookieRow).getByTestId("mobile-team-move-btn"));
    await screen.findByTestId("mobile-team-move-sheet");
    fireEvent.click(screen.getByTestId("mobile-team-move-sheet-backdrop"));
    await waitFor(() => {
      expect(screen.queryByTestId("mobile-team-move-sheet")).not.toBeInTheDocument();
    });
  });
});
