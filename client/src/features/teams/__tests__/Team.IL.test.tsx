import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// API module: mock everything Team.tsx pulls from it.
vi.mock("../../../api", () => ({
  getPlayerSeasonStats: vi.fn(),
  getTeamDetails: vi.fn(),
  getTeams: vi.fn(),
  getTeamAiInsights: vi.fn().mockResolvedValue(null),
}));

// Team feature api
vi.mock("../api", () => ({
  getTeamAiInsightsHistory: vi.fn().mockResolvedValue({ weeks: [] }),
  getTeamPeriodRoster: vi.fn().mockResolvedValue({ roster: [] }),
  getTradeBlock: vi.fn().mockResolvedValue({ playerIds: [] }),
}));

// Simple contexts
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1, outfieldMode: "OF", seasonStatus: "IN_SEASON", myTeamId: 10 }),
}));

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ isCommissioner: () => true, isAdmin: false }),
}));

vi.mock("../../../lib/ogbaTeams", () => ({
  getOgbaTeamName: (code: string) => (code === "ACES" ? "Aces" : ""),
}));

vi.mock("../../../lib/playerDisplay", () => ({
  isPitcher: (p: any) => p.is_pitcher === true || p.group === "P",
  normalizePosition: (p: string) => p,
  formatAvg: (v: any) => (v != null ? String(v) : "—"),
  getMlbTeamAbbr: (p: any) => p.mlb_team_abbr || p.mlb_team || "—",
  sortByPosition: () => 0,
}));

vi.mock("../../../lib/sportConfig", () => ({
  mapPosition: (pos: string) => pos,
  positionToSlots: (pos: string) => [pos],
  POS_SCORE: {
    C: 0, "1B": 1, "2B": 2, "3B": 3, SS: 4, MI: 5, CM: 6, OF: 7, SP: 8, RP: 9, P: 10, DH: 11, IL: 99,
  } as Record<string, number>,
}));

// useRosterStatus — the hook Team.tsx reads MLB status from. Different tests
// override the return value to simulate ghost-IL scenarios.
const useRosterStatusMock = vi.fn();
vi.mock("../../../hooks/useRosterStatus", () => ({
  useRosterStatus: () => useRosterStatusMock(),
}));

// Heavy collaborators stubbed out — they'd otherwise require deep mocking.
vi.mock("../../../components/shared/PlayerDetailModal", () => ({
  default: () => null,
}));
vi.mock("../../auction/components/PlayerExpandedRow", () => ({
  default: () => null,
}));
vi.mock("../../../components/shared/RosterAlertAccordion", () => ({
  default: ({ label, players }: any) => (
    <div data-testid={`alert-accordion-${label}`} data-count={players.length} />
  ),
}));
vi.mock("../../watchlist/components/WatchlistPanel", () => ({ default: () => null }));
vi.mock("../../trading-block/components/TradingBlockPanel", () => ({ default: () => null }));
// PlaceOnIlModal and ActivateFromIlModal were deleted in the Roster Moves
// redesign (PR #N). Their behavior lives on the Activity → Roster Moves
// tab via PlaceOnIlPanel / ActivateFromIlPanel now. Team.tsx no longer
// imports them, so no mock is needed here.

import { getPlayerSeasonStats, getTeamDetails, getTeams } from "../../../api";
// Targets the legacy Team page at /teams/:teamCode/classic. See note
// in Team.test.tsx for context. Aurora Team has its own slim IL count
// in the hero; the rich IL subsection (Your IL Slots, Ghost IL badge,
// MLB IL candidates) lives in the legacy page.
import Team from "../pages/TeamLegacy";

const mockDbTeams = [{ id: 10, code: "ACES", name: "Aces" }];

const trout = { mlbId: 1, playerId: 1001, name: "Mike Trout", posPrimary: "OF", posList: "OF", mlbTeam: "LAA", price: 45 };
const betts = { mlbId: 2, playerId: 1002, name: "Mookie Betts", posPrimary: "OF", posList: "OF", mlbTeam: "LAD", price: 40 };
const cole = { mlbId: 3, playerId: 1003, name: "Gerrit Cole", posPrimary: "SP", posList: "SP", mlbTeam: "NYY", price: 35, is_pitcher: true };

function rosterWith(rows: any[]) {
  return { currentRoster: rows } as any;
}

function renderTeam() {
  return render(
    <MemoryRouter initialEntries={["/teams/ACES"]}>
      <Routes>
        <Route path="/teams/:teamCode" element={<Team />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTeams).mockResolvedValue(mockDbTeams as any);
  vi.mocked(getPlayerSeasonStats).mockResolvedValue([]);
  useRosterStatusMock.mockReturnValue({ ilPlayers: [], minorsPlayers: [], allPlayers: [] });
});

describe("Team page — IL subsection and ghost-IL", () => {
  it("does not render 'Your IL Slots' when no players are IL-slotted", async () => {
    vi.mocked(getTeamDetails).mockResolvedValue(rosterWith([
      { ...trout, assignedPosition: "OF" },
      { ...betts, assignedPosition: "OF" },
    ]));
    renderTeam();
    await waitFor(() => expect(screen.getByText(/Mike Trout/)).toBeInTheDocument());
    expect(screen.queryByText(/Your IL Slots/i)).not.toBeInTheDocument();
  });

  it("renders 'Your IL Slots' section with the IL-slotted player and keeps hitter table exclusive", async () => {
    vi.mocked(getTeamDetails).mockResolvedValue(rosterWith([
      { ...trout, assignedPosition: "IL" },
      { ...betts, assignedPosition: "OF" },
    ]));
    useRosterStatusMock.mockReturnValue({
      ilPlayers: [],
      minorsPlayers: [],
      allPlayers: [{ mlbId: 1, mlbStatus: "Injured 10-Day" }],
    });
    renderTeam();
    await waitFor(() => expect(screen.getByText(/Your IL Slots \(1\)/i)).toBeInTheDocument());

    // The IL-slotted player appears inside the Fantasy IL slots table
    const ilTable = screen.getByRole("table", { name: /Fantasy IL slots/i });
    expect(ilTable).toHaveTextContent("Mike Trout");

    // And is pulled OUT of the hitters table — only Betts remains
    const hittersTable = screen.getByRole("table", { name: /Hitter statistics/i });
    expect(hittersTable).toHaveTextContent("Mookie Betts");
    expect(hittersTable).not.toHaveTextContent("Mike Trout");
  });

  it("renders Ghost IL badge when the IL-slotted player's MLB status is no longer an Injured designation", async () => {
    vi.mocked(getTeamDetails).mockResolvedValue(rosterWith([
      { ...trout, assignedPosition: "IL" },
    ]));
    useRosterStatusMock.mockReturnValue({
      ilPlayers: [],
      minorsPlayers: [],
      allPlayers: [{ mlbId: 1, mlbStatus: "Active" }],
    });
    renderTeam();
    await waitFor(() => expect(screen.getByText(/Ghost IL/i)).toBeInTheDocument());
  });

  it("omits Ghost IL badge when MLB status is still a valid Injured N-Day designation", async () => {
    vi.mocked(getTeamDetails).mockResolvedValue(rosterWith([
      { ...trout, assignedPosition: "IL" },
    ]));
    useRosterStatusMock.mockReturnValue({
      ilPlayers: [],
      minorsPlayers: [],
      allPlayers: [{ mlbId: 1, mlbStatus: "Injured 60-Day" }],
    });
    renderTeam();
    await waitFor(() => expect(screen.getByText(/Your IL Slots \(1\)/i)).toBeInTheDocument());
    expect(screen.queryByText(/Ghost IL/i)).not.toBeInTheDocument();
  });

  it("filters stashed players out of the 'MLB IL Candidates' accordion", async () => {
    // Trout is already fantasy-IL-slotted AND on MLB IL.
    // Betts is active roster AND on MLB IL — i.e., a genuine stash candidate.
    vi.mocked(getTeamDetails).mockResolvedValue(rosterWith([
      { ...trout, assignedPosition: "IL" },
      { ...betts, assignedPosition: "OF" },
      { ...cole, assignedPosition: "SP" },
    ]));
    useRosterStatusMock.mockReturnValue({
      ilPlayers: [
        { mlbId: 1, playerName: "Mike Trout", mlbStatus: "Injured 10-Day", isInjured: true },
        { mlbId: 2, playerName: "Mookie Betts", mlbStatus: "Injured 10-Day", isInjured: true },
      ],
      minorsPlayers: [],
      allPlayers: [
        { mlbId: 1, mlbStatus: "Injured 10-Day" },
        { mlbId: 2, mlbStatus: "Injured 10-Day" },
      ],
    });
    renderTeam();
    await waitFor(() => {
      const accordion = screen.getByTestId("alert-accordion-MLB IL Candidates");
      expect(accordion).toHaveAttribute("data-count", "1");
    });
  });
});
