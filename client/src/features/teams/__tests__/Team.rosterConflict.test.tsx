// client/src/features/teams/__tests__/Team.rosterConflict.test.tsx
//
// Todo #181: the Team page's save path for the optimistic-concurrency guard.
// Runs the REAL saveFn that Team.tsx builds (captured from the real
// usePendingChanges hook) against a mocked API module, and asserts on the
// exact arguments updateRosterPosition receives (the If-Match token) and on
// what the owner sees when the server answers 409.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../../api", () => ({
  getPlayerSeasonStats: vi.fn(), getPlayerSeasonStatsMeta: vi.fn(() => Promise.resolve({ stats: [], computedAt: null })),
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

const ilStash = vi.hoisted(() => vi.fn());
vi.mock("../../transactions/api", () => ({
  ilStash,
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

const captured: { opts: any } = { opts: null };
vi.mock("../hooks/usePendingChanges", async () => {
  const actual = await vi.importActual<any>("../hooks/usePendingChanges");
  return {
    ...actual,
    // Real hook, but remember the options Team.tsx passes so the test can
    // call the REAL saveFn closure Team.tsx built.
    usePendingChanges: (opts: any) => {
      captured.opts = opts;
      return actual.usePendingChanges(opts);
    },
  };
});

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

import { getPlayerSeasonStats, getTeamDetails, getTeamRosterHub, getTeams } from "../../../api";

/**
 * Adapter: convert legacy `currentRoster` test fixtures to the
 * `getTeamRosterHub` partitioned response. Lets each test stay readable
 * with its single-row inputs while exercising the new wire shape.
 */
function asHub(rows: any[]): any {
  const PITCHER = new Set(["P", "SP", "RP"]);
  const hubRows = rows.map((r) => {
    const isPitcher = PITCHER.has((r.assignedPosition || r.posPrimary || "").toUpperCase());
    return {
      rosterId: r.id,
      playerId: r.playerId,
      mlbId: r.mlbId ?? null,
      playerName: r.name,
      posPrimary: r.posPrimary,
      posList: r.posList ?? r.posPrimary,
      position: r.posPrimary,
      assignedPosition: r.assignedPosition ?? r.posPrimary,
      isPitcher,
      price: r.price ?? null,
      mlbTeam: r.mlbTeam,
      isKeeper: r.isKeeper ?? null,
      gamesByPos: r.gamesByPos,
      mlbStatus: r.mlbStatus ?? null,
    };
  });
  return {
    team: { id: 10, leagueId: 1, name: "Aces", owner: "Tester", budget: 260 },
    period: null,
    hitters: hubRows.filter((r) => !r.isPitcher && r.assignedPosition !== "IL"),
    pitchers: hubRows.filter((r) => r.isPitcher && r.assignedPosition !== "IL"),
    ilPlayers: hubRows.filter((r) => r.assignedPosition === "IL"),
    droppedPlayers: [],
    computedAt: null,
  };
}
import Team from "../pages/Team";


import { ApiError } from "../../../api/base";
import { updateRosterPosition } from "../api";

const HUB_VERSION = 7;

function hubWithVersion() {
  const hub = asHub([
    { id: 1, playerId: 101, name: "Alpha", posPrimary: "2B", assignedPosition: "2B" },
    { id: 2, playerId: 102, name: "Bravo", posPrimary: "SS", assignedPosition: "SS" },
    { id: 3, playerId: 103, name: "Charlie", posPrimary: "1B", assignedPosition: "1B" },
    { id: 4, playerId: 104, name: "Delta", posPrimary: "3B", assignedPosition: "3B" },
  ]);
  hub.rosterVersion = HUB_VERSION;
  return hub;
}

const swap = (a: number, b: number, aSlot: string, bSlot: string) => ({
  id: `swap-${a}-${b}`,
  kind: "swap" as const,
  from: { rosterId: a, playerId: 100 + a, slot: aSlot },
  to: { rosterId: b, playerId: 100 + b, slot: bSlot },
});

function conflict409() {
  return new ApiError({
    message: "Roster changed since you last loaded it",
    status: 409,
    url: "/api/teams/10/roster/1",
    requestId: null,
    body: { error: "Roster changed since you last loaded it", rosterVersion: 9 },
    serverMessage: "Roster changed since you last loaded it",
  });
}

async function renderLoadedTeam() {
  render(
    <MemoryRouter initialEntries={["/teams/ACES"]}>
      <Routes>
        <Route path="/teams/:teamCode" element={<Team />} />
      </Routes>
    </MemoryRouter>,
  );
  // saveFn is rebuilt when the hub's version lands in state.
  await waitFor(() => expect(getTeamRosterHub).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(captured.opts?.saveFn).toBeTypeOf("function"));
  // Give the post-load render a tick so saveFn closes over HUB_VERSION.
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTeams).mockResolvedValue(mockDbTeams as any);
  vi.mocked(getPlayerSeasonStats).mockResolvedValue([]);
  vi.mocked(getTeamRosterHub).mockResolvedValue(hubWithVersion());
  captured.opts = null;
});
afterEach(() => cleanup());

const mockDbTeams = [{ id: 10, code: "ACES", name: "Aces" }];

describe("Team page save: rosterVersion / If-Match (todo #181)", () => {
  it("sends the hub's version on the first PATCH and each response's version on the next", async () => {
    vi.mocked(updateRosterPosition)
      .mockResolvedValueOnce({ roster: { id: 1 }, rosterVersion: 8 } as any)
      .mockResolvedValueOnce({ roster: { id: 2 }, rosterVersion: 9 } as any)
      .mockResolvedValueOnce({ roster: { id: 3 }, rosterVersion: 10 } as any)
      .mockResolvedValueOnce({ roster: { id: 4 }, rosterVersion: 11 } as any);
    await renderLoadedTeam();

    await act(async () => {
      await captured.opts.saveFn(
        [swap(1, 2, "2B", "SS"), swap(3, 4, "1B", "3B")],
        { effectiveDate: null },
      );
    });

    const calls = vi.mocked(updateRosterPosition).mock.calls;
    expect(calls).toHaveLength(4);
    // (teamId, rosterId, slot, effectiveDate, versionToken)
    expect(calls[0]).toEqual([10, 1, "SS", undefined, HUB_VERSION]);
    expect(calls[1]).toEqual([10, 2, "2B", undefined, 8]);
    expect(calls[2]).toEqual([10, 3, "3B", undefined, 9]);
    expect(calls[3]).toEqual([10, 4, "1B", undefined, 10]);
  });

  it("falls back to If-Match: * for a swap that follows a claim/IL mutation in the same batch", async () => {
    vi.mocked(ilStash).mockResolvedValue({ success: true } as any);
    vi.mocked(updateRosterPosition).mockResolvedValue({ roster: { id: 1 }, rosterVersion: 99 } as any);
    await renderLoadedTeam();

    await act(async () => {
      await captured.opts.saveFn(
        [
          { id: "il1", kind: "il_stash", playerId: 101, name: "Alpha" },
          swap(3, 4, "1B", "3B"),
        ],
        { effectiveDate: null },
      );
    });

    expect(vi.mocked(updateRosterPosition).mock.calls[0]).toEqual([10, 3, "3B", undefined, "*"]);
  });

  it("on a 409 it rejects (never reports success), reloads the hub, and skips the rest of the batch", async () => {
    vi.mocked(updateRosterPosition).mockRejectedValueOnce(conflict409());
    await renderLoadedTeam();
    const hubCallsBefore = vi.mocked(getTeamRosterHub).mock.calls.length;

    let thrown: unknown;
    await act(async () => {
      try {
        await captured.opts.saveFn(
          [swap(1, 2, "2B", "SS"), swap(3, 4, "1B", "3B")],
          { effectiveDate: null },
        );
      } catch (e) {
        thrown = e;
      }
    });

    // Not a silent success: saveFn must reject so usePendingChanges keeps the queue.
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/roster changed in another tab/i);
    // Aborted: only the first PATCH went out.
    expect(updateRosterPosition).toHaveBeenCalledTimes(1);
    // Reloaded the hub so the next save carries a fresh version.
    await waitFor(() =>
      expect(vi.mocked(getTeamRosterHub).mock.calls.length).toBeGreaterThan(hubCallsBefore),
    );
  });

  it("a non-409 failure keeps the per-row error message and does not reload the hub", async () => {
    vi.mocked(updateRosterPosition).mockRejectedValueOnce(new Error("boom"));
    await renderLoadedTeam();
    const hubCallsBefore = vi.mocked(getTeamRosterHub).mock.calls.length;
    let thrown: unknown;
    await act(async () => {
      try {
        await captured.opts.saveFn([swap(1, 2, "2B", "SS")], { effectiveDate: null });
      } catch (e) {
        thrown = e;
      }
    });
    expect((thrown as Error).message).toBe("Save failed on 2B \u2194 SS: boom");
    expect(vi.mocked(getTeamRosterHub).mock.calls.length).toBe(hubCallsBefore);
  });
});
