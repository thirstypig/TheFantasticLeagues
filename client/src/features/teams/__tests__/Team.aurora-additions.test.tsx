// client/src/features/teams/__tests__/Team.aurora-additions.test.tsx
//
// Aurora Team page (`/teams/:code`) — tests for the additions shipped in
// PR #272 and PR #274 that the existing Team.test.tsx (legacy page) and
// Team.IL.test.tsx (IL subsection on legacy) don't cover:
//
//   1. Watchlist + Trading Block + Wire List link cards (PR #272)
//      — owner-only, gated to DRAFT or IN_SEASON
//   2+3. Lineup Intelligence and Weekly Insights are HIDDEN (2026-11-11
//      team-page tidy, DOC-039): not rendered and not fetched.
//   4. Period-roster pill row (PR #272 — actually shipped here, not #274)
//      — pills render when periodOptions.length > 0; clicking a non-
//        season pill triggers getTeamPeriodRoster fetch
//
// Mock pattern mirrors Team.ghostIl.test.tsx (heavy children stubbed,
// Aurora atoms passed through, dnd-kit shimmed, RosterHubV3 stubbed) so
// we don't pull in the full Aurora bundle.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ──────────────────────────────────────────────────────────────────────
// API mocks (root + feature)
// ──────────────────────────────────────────────────────────────────────
vi.mock("../../../api", () => ({
  getPlayerSeasonStats: vi.fn(),
  getPlayerSeasonStatsMeta: vi.fn(() => Promise.resolve({ stats: [], computedAt: null })),
  getTeamDetails: vi.fn(),
  getTeamRosterHub: vi.fn(),
  getTeams: vi.fn(),
  getTeamAiInsights: vi.fn().mockResolvedValue(null),
  getSeasonStandings: vi.fn().mockResolvedValue({ periodIds: [], periodNames: [] }),
}));

vi.mock("../api", () => ({
  getTeamPeriodRoster: vi.fn().mockResolvedValue({ roster: [] }),
  updateRosterPosition: vi.fn(),
  getTradeBlock: vi.fn().mockResolvedValue({ playerIds: [] }),
  getTeamAiInsightsHistory: vi.fn().mockResolvedValue({ weeks: [] }),
}));

vi.mock("../../transactions/api", () => ({
  ilStash: vi.fn(),
  ilActivate: vi.fn(),
  syncIlStatus: vi.fn(),
}));

vi.mock("../../transactions/lib/loadRosterMovePlayers", () => ({
  loadRosterMovePlayers: vi.fn().mockResolvedValue([]),
}));

// ──────────────────────────────────────────────────────────────────────
// LeagueContext — mutable so individual tests can flip seasonStatus and
// myTeamId without remounting the module
// ──────────────────────────────────────────────────────────────────────
const leagueState: {
  myTeamId: number | null;
  seasonStatus: "SETUP" | "DRAFT" | "IN_SEASON" | "COMPLETED";
} = { myTeamId: 10, seasonStatus: "IN_SEASON" };

vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({
    leagueId: 1,
    currentLeagueName: "Test League",
    myTeamId: leagueState.myTeamId,
    myTeamCode: "ACES",
    leagueRules: {},
    outfieldMode: "OF",
    seasonStatus: leagueState.seasonStatus,
  }),
}));

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({
    me: { user: { id: 1, isAdmin: false } },
    isCommissioner: () => false,
    isAdmin: false,
  }),
}));

// ──────────────────────────────────────────────────────────────────────
// Heavy children — stub so the cards-row / pill-row branches are the
// only DOM under test
// ──────────────────────────────────────────────────────────────────────
vi.mock("../components/RosterHub", async () => {
  const actual = await vi.importActual<any>("../components/RosterHub");
  return {
    ...actual,
    // Render the `intelSlot` prop (if anything ever passes one again) so a
    // regression that re-mounts Lineup Intelligence shows up in the DOM.
    RosterHubV3: ({ intelSlot, ilPeriods, ilPlayers }: any) => (
      <div
        data-testid="roster-hub-v3-stub"
        data-il-periods={(ilPeriods ?? []).map((p: any) => p.name).join("|")}
        data-il-since={(ilPlayers ?? []).map((p: any) => String(p.ilSince)).join("|")}
      >
        {intelSlot}
      </div>
    ),
    SubrouteContainer: ({ children }: any) => <div>{children}</div>,
    FreeAgentPanel: () => null,
    DropPool: () => null,
    SaveDiffPreviewModal: () => null,
  };
});

vi.mock("../hooks/useFreeAgents", () => ({
  useFreeAgents: () => ({ data: [], loading: false, error: null }),
}));

vi.mock("../hooks/useRosterHubDrag", () => ({
  useRosterHubDrag: () => ({
    selectedRosterId: null,
    selectRow: vi.fn(),
    clearSelection: vi.fn(),
    activeRosterId: null,
    sensors: [],
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onDragCancel: vi.fn(),
    eligibleSlotsForSelected: new Set(),
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDragCancel: vi.fn(),
  }),
  isMlbIlStatusUi: (s?: string | null) =>
    !!s && /^Injured(?:\s+List)?\s+\d+-Day$/i.test(s),
}));

vi.mock("../hooks/usePendingChanges", () => ({
  usePendingChanges: () => ({
    state: { changes: [], failures: [], saving: false, error: null, effectiveDate: null },
    addChange: vi.fn(),
    removeChange: vi.fn(),
    clearChanges: vi.fn(),
    revertChange: vi.fn(),
    saveStatus: { kind: "idle" },
    save: vi.fn(),
    revert: vi.fn(),
    dependencies: new Map(),
  }),
  readPersistedChanges: () => [],
  clearPersistedChanges: vi.fn(),
  kindBreakdown: () => ({}),
  describeKindBreakdown: () => "",
}));

vi.mock("../../watchlist/components/WatchlistPanel", () => ({
  default: () => <div data-testid="watchlist-panel-stub" />,
}));
vi.mock("../../trading-block/components/TradingBlockPanel", () => ({
  default: () => <div data-testid="trading-block-panel-stub" />,
}));

// Aurora atoms — pass-through so test queries see the inner copy
vi.mock("../../../components/aurora/atoms", () => ({
  AmbientBg: ({ children }: any) => <div>{children}</div>,
  // Strip non-DOM `strong` boolean prop to silence the React DOM warning;
  // it's a styling hint on the real Glass atom, not a DOM attribute.
  Glass: ({ children, strong: _strong, ...props }: any) => <div {...props}>{children}</div>,
  IridText: ({ children }: any) => <span>{children}</span>,
  Chip: ({ children }: any) => <span>{children}</span>,
  SectionLabel: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@dnd-kit/core", async () => {
  const actual = await vi.importActual<any>("@dnd-kit/core");
  return {
    ...actual,
    DndContext: ({ children }: any) => <div>{children}</div>,
    useSensor: vi.fn(() => ({})),
    useSensors: () => [],
    PointerSensor: class {},
    TouchSensor: class {},
    KeyboardSensor: class {},
  };
});

import { getPlayerSeasonStats, getTeamDetails, getTeamRosterHub, getTeams, getSeasonStandings, getTeamAiInsights } from "../../../api";
import { getTeamAiInsightsHistory, getTeamPeriodRoster } from "../api";
import Team from "../pages/Team";

const mockDbTeams = [
  { id: 10, code: "ACES", name: "Aces" },
  { id: 11, code: "BEES", name: "Bees" },
];

function renderTeam(teamCode: string = "ACES") {
  return render(
    <MemoryRouter initialEntries={[`/teams/${teamCode}`]}>
      <Routes>
        <Route path="/teams/:teamCode" element={<Team />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // default: viewer is owner of ACES, season IN_SEASON
  leagueState.myTeamId = 10;
  leagueState.seasonStatus = "IN_SEASON";

  vi.mocked(getTeams).mockResolvedValue(mockDbTeams as any);
  vi.mocked(getPlayerSeasonStats).mockResolvedValue([]);
  vi.mocked(getTeamDetails).mockResolvedValue({ currentRoster: [] } as any);
  vi.mocked(getTeamRosterHub).mockResolvedValue({
    team: { id: 10, leagueId: 1, name: "Aces", owner: "Tester", budget: 260 },
    period: null,
    hitters: [],
    pitchers: [],
    ilPlayers: [],
    droppedPlayers: [],
    computedAt: null,
  } as any);
  vi.mocked(getSeasonStandings).mockResolvedValue({ periodIds: [], periodNames: [] } as any);
  vi.mocked(getTeamAiInsightsHistory).mockResolvedValue({ weeks: [] });
  vi.mocked(getTeamPeriodRoster).mockResolvedValue({ roster: [] } as any);
});

afterEach(() => cleanup());

// ──────────────────────────────────────────────────────────────────────
// 1. Watchlist + Trading Block + Wire List link cards (PR #272)
// ──────────────────────────────────────────────────────────────────────
describe("Aurora Team — Watchlist / Trading Block / Wire List cards", () => {
  it("renders all three cards with correct titles and a wire-list link to /teams/:code/wire-list when the viewer owns the team during IN_SEASON", async () => {
    leagueState.myTeamId = 10;
    leagueState.seasonStatus = "IN_SEASON";
    renderTeam("ACES");

    await waitFor(() => {
      expect(screen.getByText(/Watchlist/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Trading Block/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiver Wire List/i)).toBeInTheDocument();

    // The wire-list link must point at the per-team route — regression
    // guard against #272's link target being lost in a future refactor.
    const wireLink = screen.getByRole("link", { name: /Open wire list/i });
    expect(wireLink).toHaveAttribute("href", "/teams/ACES/wire-list");

    // The watchlist + trading-block stubs render — confirms they're
    // mounted with the correct teamId, not just the section labels.
    expect(screen.getByTestId("watchlist-panel-stub")).toBeInTheDocument();
    expect(screen.getByTestId("trading-block-panel-stub")).toBeInTheDocument();
  });

  it("hides all three cards when the viewer is not the team owner (viewing another owner's team)", async () => {
    // Viewer owns team 11 (BEES); we navigate to ACES (id 10).
    leagueState.myTeamId = 11;
    leagueState.seasonStatus = "IN_SEASON";
    renderTeam("ACES");

    // Wait for page resolution (team header text appears)
    await waitFor(() => expect(screen.getByText("Aces")).toBeInTheDocument());

    expect(screen.queryByText(/Watchlist/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Trading Block/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiver Wire List/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("watchlist-panel-stub")).not.toBeInTheDocument();
  });

  it("hides the three cards during SETUP — pre-draft, no wire-list relevance", async () => {
    leagueState.myTeamId = 10;
    leagueState.seasonStatus = "SETUP";
    renderTeam("ACES");

    await waitFor(() => expect(screen.getByText("Aces")).toBeInTheDocument());

    expect(screen.queryByText(/Watchlist/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Trading Block/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiver Wire List/i)).not.toBeInTheDocument();
  });

  it("hides the three cards during COMPLETED — season over, transactions closed", async () => {
    leagueState.myTeamId = 10;
    leagueState.seasonStatus = "COMPLETED";
    renderTeam("ACES");

    await waitFor(() => expect(screen.getByText("Aces")).toBeInTheDocument());

    expect(screen.queryByText(/Watchlist/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Trading Block/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiver Wire List/i)).not.toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────────────────
// 2. Lineup Intelligence + Weekly Insights are hidden (DOC-039)
// ──────────────────────────────────────────────────────────────────────
describe("Aurora Team — Lineup Intelligence and Weekly Insights are not rendered and not fetched", () => {
  it("renders neither section and calls neither AI endpoint, even when history exists", async () => {
    vi.mocked(getTeamAiInsightsHistory).mockResolvedValue({
      weeks: [
        { weekKey: "2026-W14", generatedAt: "2026-04-01T00:00:00Z", overallGrade: "A", insights: [{ category: "POWER", title: "Recent power surge", detail: "d" }] },
        { weekKey: "2026-W13", generatedAt: "2026-03-25T00:00:00Z", overallGrade: "B", insights: [{ category: "SPEED", title: "Stolen-base lull", detail: "d" }] },
      ],
    });
    renderTeam("ACES");

    await waitFor(() => expect(screen.getByText("Aces")).toBeInTheDocument());
    // let the load effects settle
    await waitFor(() => expect(getTeamRosterHub).toHaveBeenCalled());

    expect(screen.queryByText(/Lineup intelligence/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Weekly insights/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recent power surge/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /2026-W1/ })).not.toBeInTheDocument();
    expect(getTeamAiInsights).not.toHaveBeenCalled();
    expect(getTeamAiInsightsHistory).not.toHaveBeenCalled();
  });

  it("threads the hub's ilSince and leaguePeriods down to the IL section", async () => {
    vi.mocked(getTeamRosterHub).mockResolvedValue({
      team: { id: 10, leagueId: 1, name: "Aces", owner: "Tester", budget: 260 },
      period: null,
      hitters: [],
      pitchers: [],
      ilPlayers: [
        { rosterId: 5, playerId: 50, playerName: "Hurt Guy", isPitcher: true, assignedPosition: "IL", ilSince: "2026-06-10T00:00:00.000Z" },
      ],
      leaguePeriods: [
        { id: 1, name: "Period 1", status: "completed", startDate: "2026-03-25T00:00:00.000Z" },
        { id: 5, name: "Period 5", status: "active", startDate: "2026-06-01T00:00:00.000Z" },
      ],
      droppedPlayers: [],
      computedAt: null,
    } as any);
    renderTeam("ACES");
    const stub = await screen.findByTestId("roster-hub-v3-stub");
    await waitFor(() => expect(stub.getAttribute("data-il-since")).toBe("2026-06-10T00:00:00.000Z"));
    expect(stub.getAttribute("data-il-periods")).toBe("Period 1|Period 5");
  });

  it("does not render the instruction paragraph or an AI Hub link", () => {
    renderTeam("ACES");
    expect(screen.queryByText(/Tap a slot pill/i)).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/ai"]')).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────
// 4. Period-roster pill row (shipped in PR #272)
// ──────────────────────────────────────────────────────────────────────
describe("Aurora Team — period-roster pill row", () => {
  it("renders each period name (no Cumulative tab) when periodOptions.length > 0", async () => {
    vi.mocked(getSeasonStandings).mockResolvedValue({
      periodIds: [101, 102],
      periodNames: ["April", "May"],
    } as any);
    renderTeam("ACES");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^April$/ })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /^May$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cumulative/i })).not.toBeInTheDocument();
  });

  it("does not render the pill row when periodOptions is empty", async () => {
    vi.mocked(getSeasonStandings).mockResolvedValue({
      periodIds: [],
      periodNames: [],
    } as any);
    renderTeam("ACES");

    await waitFor(() => expect(screen.getByText("Aces")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Cumulative/i })).not.toBeInTheDocument();
  });

  it("defaults to season view on load; clicking a period pill fetches that period", async () => {
    vi.mocked(getSeasonStandings).mockResolvedValue({
      periodIds: [101, 102],
      periodNames: ["April", "May"],
    } as any);
    vi.mocked(getTeamPeriodRoster).mockResolvedValue({ roster: [] } as any);

    renderTeam("ACES");

    await waitFor(() => expect(screen.getByRole("button", { name: /^April$/ })).toBeInTheDocument());

    // Season pill is the default — no period-roster fetch on mount.
    expect(getTeamPeriodRoster).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^May$/ }));
    await waitFor(() => {
      expect(getTeamPeriodRoster).toHaveBeenCalledWith(10, 102);
    });

    fireEvent.click(screen.getByRole("button", { name: /^April$/ }));
    await waitFor(() => {
      expect(getTeamPeriodRoster).toHaveBeenCalledWith(10, 101);
    });
  });
});
