/**
 * Smoke test for TeamLegacy.tsx — mounts the component with mocked APIs and
 * confirms it renders without throwing. Two tests: idle loading state and the
 * resolved team-name heading.
 *
 * Deep behaviour (IL slots, ghost-IL, period roster, weekly insights, etc.) is
 * covered by the sibling tests in client/src/features/teams/__tests__/.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ── Root API module ──────────────────────────────────────────────────────────
vi.mock("../../../../api", () => ({
  getPlayerSeasonStatsMeta: vi.fn(() => Promise.resolve({ stats: [], computedAt: null })),
  getTeamDetails: vi.fn(),
  getTeams: vi.fn(),
  getTeamAiInsights: vi.fn().mockResolvedValue(null),
}));

// ── Feature-local API module ─────────────────────────────────────────────────
vi.mock("../../api", () => ({
  getTeamAiInsightsHistory: vi.fn().mockResolvedValue({ weeks: [] }),
  getTeamPeriodRoster: vi.fn().mockResolvedValue({ roster: [] }),
  getTradeBlock: vi.fn().mockResolvedValue({ playerIds: [] }),
}));

// ── LeagueContext ────────────────────────────────────────────────────────────
vi.mock("../../../../contexts/LeagueContext", () => ({
  useLeague: () => ({
    leagueId: 1,
    outfieldMode: "OF",
    seasonStatus: "IN_SEASON",
    myTeamId: null,
  }),
}));

// ── AuthProvider ─────────────────────────────────────────────────────────────
vi.mock("../../../../auth/AuthProvider", () => ({
  useAuth: () => ({ isCommissioner: false, isAdmin: false }),
}));

// ── Lib helpers ──────────────────────────────────────────────────────────────
vi.mock("../../../../lib/ogbaTeams", () => ({
  getOgbaTeamName: (code: string) => (code === "ACES" ? "Aces" : ""),
}));

vi.mock("../../../../lib/playerDisplay", () => ({
  isPitcher: (p: any) => p.is_pitcher === true,
  normalizePosition: (p: string) => p,
  formatAvg: (v: any) => (v != null ? String(v) : "—"),
  getMlbTeamAbbr: (p: any) => p.mlb_team_abbr || "—",
  sortByPosition: () => 0,
}));

vi.mock("../../../../lib/sportConfig", () => ({
  mapPosition: (pos: string) => pos,
  positionToSlots: (pos: string) => [pos],
  POS_SCORE: {} as Record<string, number>,
}));

vi.mock("../../../../lib/mlbStatus", () => ({
  isMlbIlStatus: () => false,
}));

// ── Hooks ────────────────────────────────────────────────────────────────────
vi.mock("../../../../hooks/useRosterStatus", () => ({
  useRosterStatus: () => ({ ilPlayers: [], minorsPlayers: [], allPlayers: [] }),
}));

// ── Heavy child components (prevent deep dependency pulls) ───────────────────
vi.mock("../../../../components/shared/PlayerDetailModal", () => ({
  default: () => null,
}));
vi.mock("../../../auction/components/PlayerExpandedRow", () => ({
  default: () => null,
}));
vi.mock("../../../../components/shared/RosterAlertAccordion", () => ({
  default: () => null,
}));
vi.mock("../../../watchlist/components/WatchlistPanel", () => ({
  default: () => null,
}));
vi.mock("../../../trading-block/components/TradingBlockPanel", () => ({
  default: () => null,
}));

// ── Import the component under test (after all mocks) ────────────────────────
import { getTeams, getTeamDetails } from "../../../../api";
import TeamLegacy from "../TeamLegacy";

// ── Shared fixtures ──────────────────────────────────────────────────────────
const mockDbTeams = [{ id: 10, code: "ACES", name: "Aces" }];

const mockDetails = {
  currentRoster: [
    {
      id: 1,
      mlbId: 100,
      name: "Mike Trout",
      posPrimary: "CF",
      posList: "CF",
      mlbTeam: "LAA",
      price: 45,
      assignedPosition: "OF",
      isKeeper: false,
    },
  ],
  periodSummaries: [],
};

function renderTeamLegacy(teamCode = "ACES") {
  return render(
    <MemoryRouter initialEntries={[`/teams/${teamCode}`]}>
      <Routes>
        <Route path="/teams/:teamCode" element={<TeamLegacy />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTeams).mockResolvedValue(mockDbTeams as any);
  vi.mocked(getTeamDetails).mockResolvedValue(mockDetails as any);
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe("TeamLegacy smoke tests", () => {
  it("mounts without throwing and shows the loading state", () => {
    // Keep getTeams pending so the component stays in the loading state.
    vi.mocked(getTeams).mockReturnValue(new Promise(() => {}));

    // render() itself must not throw
    expect(() => renderTeamLegacy()).not.toThrow();

    expect(screen.getByText("Loading roster…")).toBeInTheDocument();
  });

  it("renders the team name heading after data loads", async () => {
    renderTeamLegacy();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /aces/i })).toBeInTheDocument();
    });
  });
});
