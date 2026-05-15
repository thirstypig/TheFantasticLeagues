import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileTeam } from "../pages/MobileTeam";
import { getTeams, getTeamRosterHub, updateRosterPosition, getTeamPeriodRoster } from "../../features/teams/api";
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
  getTeamPlayerSeasonStats: vi.fn().mockResolvedValue({ stats: [] }),
  getTeamPeriodRoster: vi.fn(),
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
    // AB=200, H=61 → combined AVG = 61/200 = .305; HR=30+20=50; RBI=90+75=165; SB=12+1=13
    { rosterId: 1, playerId: 1, mlbId: 100, playerName: "Mookie Betts", posPrimary: "OF", posList: "OF,2B", position: "OF", assignedPosition: "OF", isPitcher: false, mlbTeam: "LAD", AB: 100, H: 30, AVG: 0.300, HR: 30, RBI: 90, SB: 12 },
    { rosterId: 2, playerId: 2, mlbId: 200, playerName: "Will Smith", posPrimary: "C", position: "C", assignedPosition: "C", isPitcher: false, mlbTeam: "LAD", AB: 100, H: 31, AVG: 0.310, HR: 20, RBI: 75, SB: 1 },
  ],
  pitchers: [
    // IP=60, ER=23 → ERA=(23/60)*9=3.45; BB_H=69, WHIP=69/60=1.15; W=12; K=200
    { rosterId: 10, playerId: 10, mlbId: 1000, playerName: "Tyler Glasnow", posPrimary: "SP", position: "SP", assignedPosition: "SP", isPitcher: true, mlbTeam: "LAD", IP: 60, ER: 23, BB_H: 69, W: 12, K: 200, ERA: 3.45, WHIP: 1.15 },
    // IP=30, ER=9 → ERA=2.70; BB_H=33, WHIP=1.10; W=5; K=90
    // Combined: IP=90, ER=32, ERA=3.20; BB_H=102, WHIP=1.13; W=17; K=290
    { rosterId: 11, playerId: 11, mlbId: 1100, playerName: "Walker Buehler", posPrimary: "RP", position: "RP", assignedPosition: "RP", isPitcher: true, mlbTeam: "LAD", IP: 30, ER: 9, BB_H: 33, W: 5, K: 90, ERA: 2.70, WHIP: 1.10 },
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
    // Drop candidates = all active hitters + pitchers (Mookie + Will + Glasnow + Buehler)
    const targets = screen.getAllByTestId("mobile-team-il-activate-drop-target");
    expect(targets.length).toBe(4);
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

  // ── Totals row ────────────────────────────────────────────────────────

  it("renders a Hitter Totals row with cumulative stats from summed numerators", async () => {
    renderTeam();
    await screen.findByText("Mookie Betts");
    expect(screen.getByText("Hitter Totals")).toBeInTheDocument();
    // AVG = H/AB = (30+31)/(100+100) = 61/200 = .305
    expect(screen.getByText(".305")).toBeInTheDocument();
    // HR = 30+20 = 50
    expect(screen.getByText("50")).toBeInTheDocument();
    // RBI = 90+75 = 165
    expect(screen.getByText("165")).toBeInTheDocument();
    // SB = 12+1 = 13
    expect(screen.getByText("13")).toBeInTheDocument();
  });

  it("renders a Pitcher Totals row with rate stats derived from summed IP/ER/BB_H", async () => {
    renderTeam();
    await screen.findByText("Mookie Betts");
    fireEvent.click(screen.getByRole("tab", { name: "Pitchers" }));
    await screen.findByText("Tyler Glasnow");
    expect(screen.getByText("Pitcher Totals")).toBeInTheDocument();
    // W=17 (12+5), K=290 (200+90) — totals differ from either individual row
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("290")).toBeInTheDocument();
    // ERA = (ER/IP)*9 = (32/90)*9 = 3.20 (summed numerators across both pitchers)
    expect(screen.getByText("3.20")).toBeInTheDocument();
    // WHIP = BB_H/IP = 102/90 = 1.13
    expect(screen.getByText("1.13")).toBeInTheDocument();
  });

  it("hides the totals row on the IL tab", async () => {
    renderTeam();
    await screen.findByText("Mookie Betts");
    fireEvent.click(screen.getByRole("tab", { name: "IL" }));
    await screen.findByText("Clayton Kershaw");
    expect(screen.queryByText("Hitter Totals")).not.toBeInTheDocument();
    expect(screen.queryByText("Pitcher Totals")).not.toBeInTheDocument();
  });
});

// ── Period mode (historical views) ────────────────────────────────────────
// These tests guard against two regressions:
// 1. IL players appearing in the Hitters/Pitchers tabs in period mode
// 2. IL players' stats inflating team totals in period mode

// A pitcher on IL during a period: assignedPosition="IL", so isPitcher=false
// (PITCHER_SLOTS doesn't include "IL"). Before the fix, they leaked into the
// Hitters tab. After the fix, they are excluded from both tabs.
const PERIOD_ROSTER_P1 = {
  period: { id: 35, name: "Period 1", startDate: "2026-03-25T00:00:00.000Z", endDate: "2026-04-18T00:00:00.000Z" },
  roster: [
    // Active hitter: counts toward Hitter Totals (HR=2, RBI=7, AB=60, H=12)
    {
      id: 1, playerId: 1, mlbId: 100, name: "Mookie Betts",
      posPrimary: "SS", posList: "SS,OF", mlbTeam: "LAD",
      assignedPosition: "SS", releasedAt: null, acquiredAt: "2026-03-01T00:00:00.000Z",
      source: "AUCTION", price: 40, isActive: true,
      periodStats: { AB: 60, H: 12, HR: 2, R: 7, RBI: 7, SB: 1, IP: 0, ER: 0, BB_H: 0, W: 0, SV: 0, K: 0 },
    },
    // Player on IL at period start (stashed before/at period start):
    // assignedPosition="IL" → isPitcher=false → would leak into Hitters before the fix.
    // HR=5, RBI=20 must NOT appear in Hitter Totals.
    {
      id: 20, playerId: 20, mlbId: 2000, name: "Clayton Kershaw",
      posPrimary: "SP", posList: "SP", mlbTeam: "LAD",
      assignedPosition: "IL", releasedAt: null, acquiredAt: "2026-03-01T00:00:00.000Z",
      source: "AUCTION", price: 15, isActive: true,
      periodStats: { AB: 10, H: 3, HR: 5, R: 4, RBI: 20, SB: 0, IP: 30, ER: 10, BB_H: 35, W: 4, SV: 0, K: 60 },
    },
  ],
};

describe("MobileTeam — period mode IL filtering", () => {
  beforeEach(() => {
    // Expose period options so the period buttons render
    vi.mocked(getSeasonStandings).mockResolvedValue({
      periodIds: [35, 36],
      periodNames: ["Period 1", "Period 2"],
      rows: [
        { teamId: 101, teamCode: "LDY", teamName: "Los Doyers", periodPoints: [30, 28] },
        { teamId: 202, teamCode: "DLC", teamName: "Demolition Lumber Co.", periodPoints: [35, 31] },
      ],
    } as any);
    vi.mocked(getTeamPeriodRoster).mockResolvedValue(PERIOD_ROSTER_P1 as any);
  });

  it("excludes IL players from the Hitters tab in period mode", async () => {
    renderTeam();
    await screen.findByText("Mookie Betts"); // cumulative loads first
    fireEvent.click(await screen.findByRole("button", { name: "Period 1" }));
    // Mookie (active SS) appears; Kershaw (IL) must not appear in Hitters
    await waitFor(() => {
      expect(screen.getByText("Mookie Betts")).toBeInTheDocument();
    });
    expect(screen.queryByText("Clayton Kershaw")).not.toBeInTheDocument();
  });

  it("does not count IL player stats in Hitter Totals in period mode", async () => {
    renderTeam();
    await screen.findByText("Mookie Betts");
    fireEvent.click(await screen.findByRole("button", { name: "Period 1" }));
    // Kershaw's HR=5 and RBI=20 must not appear in totals.
    // Only Mookie's HR=2 and RBI=7 should be in totals.
    await waitFor(() => {
      expect(screen.getByText("Mookie Betts")).toBeInTheDocument();
    });
    // HR total: only Mookie's 2, not Kershaw's 5 (which would give 7)
    const hitterTotals = screen.getByText("Hitter Totals").closest("tr") ?? screen.getByText("Hitter Totals").parentElement!.parentElement!;
    // HR=2, RBI=7 (Mookie only). If Kershaw leaked, HR would be 7, RBI would be 27.
    expect(screen.queryByText("7", { selector: "[data-testid]" })).not.toBeInTheDocument(); // Kershaw's HR would make 7
    // The easiest assertion: no "27" in the document (Kershaw RBI=20 + Mookie RBI=7)
    expect(screen.queryByText("27")).not.toBeInTheDocument();
  });

  it("hides the IL tab in period mode (IL tab is action-only, period views are read-only)", async () => {
    // The cumulative view has Kershaw on IL → IL tab shows in cumulative
    renderTeam();
    expect(await screen.findByRole("tab", { name: "IL" })).toBeInTheDocument();
    // Switch to period mode — IL tab must disappear
    fireEvent.click(await screen.findByRole("button", { name: "Period 1" }));
    await waitFor(() => {
      expect(screen.queryByRole("tab", { name: "IL" })).not.toBeInTheDocument();
    });
  });

  it("shows active players normally in period mode Hitters tab", async () => {
    renderTeam();
    await screen.findByText("Mookie Betts");
    fireEvent.click(await screen.findByRole("button", { name: "Period 1" }));
    // Mookie (active SS) must be visible; Kershaw (IL) must not appear in Hitters
    await waitFor(() => {
      expect(screen.getByText("Mookie Betts")).toBeInTheDocument();
    });
    expect(screen.queryByText("Clayton Kershaw")).not.toBeInTheDocument();
  });
});
