// client/src/features/teams/__tests__/Team.ghostIl.test.tsx
//
// End-of-pipe test for the v3 hub's ghost-IL warning chip. The chip was
// shipped dormant in PR #214 (Cluster K) — wired to
// `RosterHubPlayer.mlbStatus` but the field was always undefined because
// no source populated `Player.mlbStatus`. With the
// feat/player-mlbstatus-plumbing PR adding the column, the daily sync,
// and the team-detail wire field, this test pins the wake-up condition:
//
//   active-roster row + mlbStatus="Injured 10-Day" + assignedSlot !== "IL"
//   → ghost-IL chip renders with Resync button
//
// Renders the Aurora Team page (not TeamLegacy — that has its own ghost
// detector via useRosterStatus). Uses the same heavy-mock pattern as
// Team.IL.test.tsx so we don't pull in Aurora's full bundle.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../../api", () => ({
  getPlayerSeasonStats: vi.fn(),
  getTeamDetails: vi.fn(),
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
  syncIlStatus: vi.fn().mockResolvedValue({ playerId: 1, mlbId: 100, mlbStatus: "Injured 10-Day", fetchedAt: new Date().toISOString() }),
}));

vi.mock("../../transactions/lib/loadRosterMovePlayers", () => ({
  loadRosterMovePlayers: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({
    leagueId: 1,
    currentLeagueName: "Test League",
    myTeamId: 10,
    leagueRules: {},
    outfieldMode: "OF",
    seasonStatus: "IN_SEASON",
  }),
}));

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({
    me: { user: { id: 1, isAdmin: true } },
    isCommissioner: () => true,
    isAdmin: false,
  }),
}));

// Heavy children — the chip's rendering path doesn't depend on these.
vi.mock("../components/RosterHub", async () => {
  const actual = await vi.importActual<any>("../components/RosterHub");
  return {
    ...actual,
    RosterHubV3: () => <div data-testid="roster-hub-v3-stub" />,
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
  }),
  // The real isMlbIlStatusUi is imported by Team.tsx directly to drive
  // ghostIlSuspects — pass-through implementation that mirrors prod.
  isMlbIlStatusUi: (s?: string | null) =>
    !!s && /^Injured(?:\s+List)?\s+\d+-Day$/i.test(s),
}));

vi.mock("../hooks/usePendingChanges", () => ({
  usePendingChanges: () => ({
    state: { changes: [], failures: [], saving: false, error: null },
    addChange: vi.fn(),
    removeChange: vi.fn(),
    clearChanges: vi.fn(),
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

// Aurora atoms
vi.mock("../../../components/aurora/atoms", () => ({
  AmbientBg: ({ children }: any) => <div>{children}</div>,
  Glass: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  IridText: ({ children }: any) => <span>{children}</span>,
  Chip: ({ children }: any) => <span>{children}</span>,
  SectionLabel: ({ children }: any) => <div>{children}</div>,
}));

// dnd-kit — we don't drag in tests
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

import { getPlayerSeasonStats, getTeamDetails, getTeams } from "../../../api";
import Team from "../pages/Team";

const mockDbTeams = [{ id: 10, code: "ACES", name: "Aces" }];

function renderTeam() {
  return render(
    <MemoryRouter initialEntries={["/teams/ACES"]}>
      <Routes>
        <Route path="/teams/:teamCode" element={<Team />} />
        <Route path="/teams/:teamCode/manage/claim" element={<Team />} />
        <Route path="/teams/:teamCode/manage/il-stash" element={<Team />} />
        <Route path="/teams/:teamCode/manage/il-activate" element={<Team />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTeams).mockResolvedValue(mockDbTeams as any);
  vi.mocked(getPlayerSeasonStats).mockResolvedValue([]);
});

afterEach(() => {
  // Force-unmount between tests so the previous render's lingering DOM
  // doesn't bleed into the next assertion (vitest doesn't auto-cleanup
  // when running multiple tests in the same file via the default config).
  cleanup();
});

describe("Team page (Aurora) — ghost-IL warning chip wakes up with Player.mlbStatus", () => {
  it("renders the ghost-IL chip when mlbStatus is Injured-Day and player is NOT on IL slot", async () => {
    vi.mocked(getTeamDetails).mockResolvedValue({
      team: { id: 10, name: "Aces", owner: "Tester", budget: 260 },
      currentRoster: [
        {
          id: 1, playerId: 100, name: "Mike Trout", posPrimary: "OF", posList: "OF",
          mlbTeam: "LAA", price: 45,
          assignedPosition: "OF", // active — NOT "IL"
          mlbStatus: "Injured 10-Day", // gap: status says IL, slot says OF
        },
      ],
    } as any);

    renderTeam();

    await waitFor(() => {
      expect(screen.getByTestId("ghost-il-chip")).toBeInTheDocument();
    });
    // Chip body shows the verbatim status string per direction-lock IL #1.
    expect(screen.getByText(/Injured 10-Day/)).toBeInTheDocument();
    expect(screen.getByText("Mike Trout")).toBeInTheDocument();
  });

  it("does NOT render the ghost-IL chip when mlbStatus is Active", async () => {
    vi.mocked(getTeamDetails).mockResolvedValue({
      team: { id: 10, name: "Aces", owner: "Tester", budget: 260 },
      currentRoster: [
        {
          id: 1, playerId: 100, name: "Mike Trout", posPrimary: "OF", posList: "OF",
          mlbTeam: "LAA", price: 45,
          assignedPosition: "OF",
          mlbStatus: "Active",
        },
      ],
    } as any);

    renderTeam();

    // Wait for some content to render so we know the page is past loading.
    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("ghost-il-chip")).not.toBeInTheDocument();
  });

  it("does NOT render the ghost-IL chip when player IS on the IL slot", async () => {
    // The chip's whole point is to surface the gap. When the player is
    // already IL-slotted, no chip — there's nothing to warn about.
    //
    // Subtle: Team.tsx reads `assignedPosition` from the player-stats join
    // (not the team-detail row directly) — see RosterPlayer mapping in
    // pages/Team.tsx around the `stat?.assignedPosition || row.posPrimary`
    // line. So the test must seed both surfaces to drive the IL slot.
    vi.mocked(getTeamDetails).mockResolvedValue({
      team: { id: 10, name: "Aces", owner: "Tester", budget: 260 },
      currentRoster: [
        {
          id: 1, playerId: 100, name: "Mike Trout", posPrimary: "OF", posList: "OF",
          mlbTeam: "LAA", price: 45,
          assignedPosition: "IL",
          mlbStatus: "Injured 10-Day",
        },
      ],
    } as any);
    vi.mocked(getPlayerSeasonStats).mockResolvedValue([
      { id: 100, assignedPosition: "IL" } as any,
    ]);

    renderTeam();

    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("ghost-il-chip")).not.toBeInTheDocument();
  });

  it("does NOT render the ghost-IL chip when mlbStatus is null/undefined", async () => {
    // Free agents and synthetic rows have no MLB status. The chip stays
    // dormant exactly like before this PR — we only wake it up when the
    // wire payload includes a real Injured-Day designation.
    vi.mocked(getTeamDetails).mockResolvedValue({
      team: { id: 10, name: "Aces", owner: "Tester", budget: 260 },
      currentRoster: [
        {
          id: 1, playerId: 100, name: "Mike Trout", posPrimary: "OF", posList: "OF",
          mlbTeam: "LAA", price: 45,
          assignedPosition: "OF",
          mlbStatus: null,
        },
      ],
    } as any);

    renderTeam();

    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("ghost-il-chip")).not.toBeInTheDocument();
  });
});
