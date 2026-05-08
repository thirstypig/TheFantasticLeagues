// client/src/features/teams/__tests__/Team.aurora-additions.test.tsx
//
// Aurora Team page (`/teams/:code`) — tests for the additions shipped in
// PR #272 and PR #274 that the existing Team.test.tsx (legacy page) and
// Team.IL.test.tsx (IL subsection on legacy) don't cover:
//
//   1. Watchlist + Trading Block + Wire List link cards (PR #272)
//      — owner-only, gated to DRAFT or IN_SEASON
//   2. Weekly Insights week-pill selector (PR #272)
//      — appears only when ≥2 weeks of insightHistory exist
//   3. Lineup Intelligence card respects selectedWeekKey (PR #274)
//      — historical week pill swaps the rendered insights and surfaces
//        the weekKey label without leaking "[object Object]" or undefined
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
    // Render the `intelSlot` prop so the Lineup Intelligence card —
    // defined in Team.tsx and threaded through this prop — actually
    // appears in the DOM. Without this, the card is never mounted.
    RosterHubV3: ({ intelSlot }: any) => (
      <div data-testid="roster-hub-v3-stub">{intelSlot}</div>
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

import { getPlayerSeasonStats, getTeamDetails, getTeamRosterHub, getTeams, getSeasonStandings } from "../../../api";
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
// 2. Weekly Insights week-pill selector (PR #272)
// ──────────────────────────────────────────────────────────────────────
describe("Aurora Team — Weekly Insights week-pill selector", () => {
  function makeWeek(weekKey: string, grade: string, insights: { category: string; title: string; detail: string }[]) {
    return { weekKey, generatedAt: "2026-04-01T00:00:00Z", overallGrade: grade, insights };
  }

  it("renders one button per week when ≥2 weeks of history exist", async () => {
    vi.mocked(getTeamAiInsightsHistory).mockResolvedValue({
      weeks: [
        makeWeek("2026-W14", "A", [{ category: "Power", title: "HR up", detail: "+5 vs avg" }]),
        makeWeek("2026-W13", "B", [{ category: "Speed", title: "SB down", detail: "" }]),
        makeWeek("2026-W12", "C", [{ category: "Pitch", title: "ERA spike", detail: "" }]),
      ],
    });
    renderTeam("ACES");

    await waitFor(() => {
      expect(screen.getByText(/Weekly insights · 3 weeks/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /2026-W14/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2026-W13/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2026-W12/ })).toBeInTheDocument();
  });

  it("does not render the selector when only 1 week of history exists", async () => {
    vi.mocked(getTeamAiInsightsHistory).mockResolvedValue({
      weeks: [makeWeek("2026-W14", "A", [{ category: "Power", title: "HR up", detail: "" }])],
    });
    renderTeam("ACES");

    await waitFor(() => expect(screen.getByText("Aces")).toBeInTheDocument());
    expect(screen.queryByText(/Weekly insights ·/i)).not.toBeInTheDocument();
  });

  it("does not render the selector when 0 weeks of history exist", async () => {
    vi.mocked(getTeamAiInsightsHistory).mockResolvedValue({ weeks: [] });
    renderTeam("ACES");

    await waitFor(() => expect(screen.getByText("Aces")).toBeInTheDocument());
    expect(screen.queryByText(/Weekly insights ·/i)).not.toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────────────────
// 3. Lineup Intelligence card respects selectedWeekKey (PR #274)
// ──────────────────────────────────────────────────────────────────────
describe("Aurora Team — Lineup Intelligence respects selectedWeekKey", () => {
  it("initially shows the most recent week's insights and labels the card with that weekKey (no '[object Object]', no 'undefined')", async () => {
    vi.mocked(getTeamAiInsightsHistory).mockResolvedValue({
      weeks: [
        {
          weekKey: "2026-W14",
          generatedAt: "2026-04-01T00:00:00Z",
          overallGrade: "A-",
          insights: [{ category: "POWER", title: "Recent power surge", detail: "Detail W14" }],
        },
        {
          weekKey: "2026-W13",
          generatedAt: "2026-03-25T00:00:00Z",
          overallGrade: "B+",
          insights: [{ category: "SPEED", title: "Stolen-base lull", detail: "Detail W13" }],
        },
      ],
    });
    renderTeam("ACES");

    // Selected week defaults to weeks[0] = 2026-W14
    await waitFor(() => {
      expect(screen.getByText(/Recent power surge/)).toBeInTheDocument();
    });

    // The historical-week label appears next to "Lineup intelligence"
    expect(screen.getByText(/· 2026-W14/)).toBeInTheDocument();

    // PR #274 narrowing-bug regression guards: "[object Object]" only
    // appears when an object is rendered as a React child by mistake;
    // "undefined" appears when an undefined value is templated. Either
    // would indicate the activeInsightWeekKey cast lost its narrowing.
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^undefined$/)).not.toBeInTheDocument();
  });

  it("clicking a different week pill swaps the rendered insights to that week's snapshot", async () => {
    vi.mocked(getTeamAiInsightsHistory).mockResolvedValue({
      weeks: [
        {
          weekKey: "2026-W14",
          generatedAt: "2026-04-01T00:00:00Z",
          overallGrade: "A-",
          insights: [{ category: "POWER", title: "Recent power surge", detail: "Detail W14" }],
        },
        {
          weekKey: "2026-W13",
          generatedAt: "2026-03-25T00:00:00Z",
          overallGrade: "B+",
          insights: [{ category: "SPEED", title: "Stolen-base lull", detail: "Detail W13" }],
        },
      ],
    });
    renderTeam("ACES");

    // Wait for default selection (W14)
    await waitFor(() => expect(screen.getByText(/Recent power surge/)).toBeInTheDocument());
    expect(screen.queryByText(/Stolen-base lull/)).not.toBeInTheDocument();

    // Click the W13 pill
    fireEvent.click(screen.getByRole("button", { name: /2026-W13/ }));

    // W13 content should appear and W14 should disappear
    await waitFor(() => expect(screen.getByText(/Stolen-base lull/)).toBeInTheDocument());
    expect(screen.queryByText(/Recent power surge/)).not.toBeInTheDocument();

    // The historical-week chip should now read W13, not W14
    expect(screen.getByText(/· 2026-W13/)).toBeInTheDocument();
    expect(screen.queryByText(/· 2026-W14/)).not.toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────────────────
// 4. Period-roster pill row (shipped in PR #272)
// ──────────────────────────────────────────────────────────────────────
describe("Aurora Team — period-roster pill row", () => {
  it("renders 'Cumulative' + each period name when periodOptions.length > 0", async () => {
    vi.mocked(getSeasonStandings).mockResolvedValue({
      periodIds: [101, 102],
      periodNames: ["April", "May"],
    } as any);
    renderTeam("ACES");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Cumulative/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /^April$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^May$/ })).toBeInTheDocument();
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

  it("clicking a period pill calls getTeamPeriodRoster with that periodId", async () => {
    vi.mocked(getSeasonStandings).mockResolvedValue({
      periodIds: [101, 102],
      periodNames: ["April", "May"],
    } as any);
    vi.mocked(getTeamPeriodRoster).mockResolvedValue({ roster: [] } as any);

    renderTeam("ACES");

    await waitFor(() => expect(screen.getByRole("button", { name: /^May$/ })).toBeInTheDocument());

    // Sanity: nothing fetched in season mode (default).
    expect(getTeamPeriodRoster).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^May$/ }));

    await waitFor(() => {
      expect(getTeamPeriodRoster).toHaveBeenCalledWith(10, 102);
    });
  });
});
