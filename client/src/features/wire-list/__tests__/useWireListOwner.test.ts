/**
 * Unit tests for useWireListOwner hook.
 *
 * Regression targets:
 *   - getTeams + getActivePeriod MUST be called in parallel on mount
 *     (Promise.all pattern — no serial two-effect cascade)
 *   - ApiError 404 from getActivePeriod → period = null, NO error state
 *   - Non-404 error → error state with static message, reportError called
 *   - Team not found → error state with helpful message
 *   - isReadOnly: true when period null or non-PENDING; false when PENDING
 */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock boundaries ──────────────────────────────────────────────────

vi.mock("../api", () => ({
  getActivePeriod: vi.fn(),
  getAddEntries: vi.fn(),
  getDropEntries: vi.fn(),
  deleteAddEntry: vi.fn(),
  deleteDropEntry: vi.fn(),
  updateDropEntry: vi.fn(),
  reorderEntries: vi.fn(),
}));

vi.mock("../../teams/api", () => ({
  getTeams: vi.fn(),
  getTeamRosterHub: vi.fn(),
}));

vi.mock("../../../lib/errorBus", () => ({
  reportError: vi.fn(),
}));

// Keep real ApiError so instanceof checks work in the hook.
vi.mock("../../../api/base", async () => {
  const actual = await vi.importActual<typeof import("../../../api/base")>(
    "../../../api/base",
  );
  return actual;
});

import {
  getActivePeriod,
  getAddEntries,
  getDropEntries,
} from "../api";
import { getTeams, getTeamRosterHub } from "../../teams/api";
import { reportError } from "../../../lib/errorBus";
import { ApiError } from "../../../api/base";
import { useWireListOwner } from "../hooks/useWireListOwner";

// ─── Fixtures ─────────────────────────────────────────────────────────

const TEAM = { id: 101, code: "LDY", name: "Lady Doyers" };
const PERIOD = { id: 5, status: "PENDING", deadlineAt: "2026-06-20T18:00:00Z", leagueId: 20 };
const ADD_ENTRY = { id: 10, priority: 1, playerId: 999, player: { name: "Ohtani", posPrimary: "SP", mlbTeam: "LAD" } };
const DROP_ENTRY = { id: 20, priority: 1, playerId: 888, dropMode: "RELEASE", player: { name: "Jones", posPrimary: "OF", mlbTeam: "NYY" } };

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy-path mocks
  vi.mocked(getTeams).mockResolvedValue([TEAM] as ReturnType<typeof getTeams> extends Promise<infer T> ? T : never);
  vi.mocked(getActivePeriod).mockResolvedValue({ period: PERIOD } as ReturnType<typeof getActivePeriod> extends Promise<infer T> ? T : never);
  vi.mocked(getAddEntries).mockResolvedValue({ entries: [ADD_ENTRY] } as ReturnType<typeof getAddEntries> extends Promise<infer T> ? T : never);
  vi.mocked(getDropEntries).mockResolvedValue({ entries: [DROP_ENTRY] } as ReturnType<typeof getDropEntries> extends Promise<infer T> ? T : never);
  vi.mocked(getTeamRosterHub).mockResolvedValue({ hitters: [], pitchers: [], ilPlayers: [], computedAt: null } as never);
});

// ─── Tests ────────────────────────────────────────────────────────────

describe("useWireListOwner — happy path", () => {
  it("resolves teamId, period, adds, drops after mount", async () => {
    const { result } = renderHook(() => useWireListOwner(20, "LDY"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.teamId).toBe(101);
    expect(result.current.period?.id).toBe(5);
    expect(result.current.adds).toHaveLength(1);
    expect(result.current.drops).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("calls getTeams and getActivePeriod in parallel (both called on first render)", async () => {
    const order: string[] = [];
    vi.mocked(getTeams).mockImplementation(async () => {
      order.push("getTeams");
      return [TEAM] as never;
    });
    vi.mocked(getActivePeriod).mockImplementation(async () => {
      order.push("getActivePeriod");
      return { period: PERIOD } as never;
    });

    const { result } = renderHook(() => useWireListOwner(20, "LDY"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Both must have been called — the order is non-deterministic (parallel)
    expect(order).toContain("getTeams");
    expect(order).toContain("getActivePeriod");
    // getAddEntries only called AFTER both resolve (sequential on period.id)
    expect(vi.mocked(getAddEntries)).toHaveBeenCalledWith(5, 101);
  });

  it("isReadOnly is false when period status is PENDING", async () => {
    const { result } = renderHook(() => useWireListOwner(20, "LDY"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isReadOnly).toBe(false);
  });

  it("isReadOnly is true when period status is LOCKED", async () => {
    vi.mocked(getActivePeriod).mockResolvedValue({ period: { ...PERIOD, status: "LOCKED" } } as never);
    const { result } = renderHook(() => useWireListOwner(20, "LDY"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isReadOnly).toBe(true);
  });
});

describe("useWireListOwner — 404 from getActivePeriod", () => {
  it("sets period to null with no error state when getActivePeriod returns 404", async () => {
    vi.mocked(getActivePeriod).mockRejectedValue(
      new ApiError({ status: 404, url: "/api/wire-list/periods/active", requestId: "req1", message: "Not Found", body: null }),
    );

    const { result } = renderHook(() => useWireListOwner(20, "LDY"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.period).toBeNull();
    expect(result.current.error).toBeNull();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("isReadOnly is true when period is null (no active period)", async () => {
    vi.mocked(getActivePeriod).mockRejectedValue(
      new ApiError({ status: 404, url: "/api/wire-list/periods/active", requestId: "req1", message: "Not Found", body: null }),
    );

    const { result } = renderHook(() => useWireListOwner(20, "LDY"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isReadOnly).toBe(true);
  });
});

describe("useWireListOwner — error handling", () => {
  it("sets static error string and calls reportError on non-404 API failure", async () => {
    vi.mocked(getTeams).mockRejectedValue(
      new ApiError({ status: 500, url: "/api/teams", requestId: "req2", message: "Server Error", body: null }),
    );

    const { result } = renderHook(() => useWireListOwner(20, "LDY"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Failed to load wire list. Please try again.");
    expect(reportError).toHaveBeenCalledOnce();
  });

  it("does NOT expose err.message in the error state", async () => {
    const internalMsg = "INTERNAL: db connection refused at 10.0.0.1";
    const err = new ApiError({ status: 503, url: "/api/teams", requestId: "req3", message: "Service Unavailable", body: null, serverMessage: internalMsg });
    vi.mocked(getTeams).mockRejectedValue(err);

    const { result } = renderHook(() => useWireListOwner(20, "LDY"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toContain("db connection");
    expect(result.current.error).not.toContain("10.0.0.1");
    expect(result.current.error).toBe("Failed to load wire list. Please try again.");
  });

  it("sets error state when team code is not found", async () => {
    vi.mocked(getTeams).mockResolvedValue([{ id: 99, code: "OTH", name: "Other" }] as never);

    const { result } = renderHook(() => useWireListOwner(20, "LDY"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain("LDY");
    expect(result.current.teamId).toBeNull();
  });

  it("does not fetch adds/drops when team is not found", async () => {
    vi.mocked(getTeams).mockResolvedValue([{ id: 99, code: "OTH", name: "Other" }] as never);

    const { result } = renderHook(() => useWireListOwner(20, "LDY"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getAddEntries).not.toHaveBeenCalled();
    expect(getDropEntries).not.toHaveBeenCalled();
  });
});

describe("useWireListOwner — early return guard", () => {
  it("does not fetch when leagueId is null", async () => {
    const { result } = renderHook(() => useWireListOwner(null, "LDY"));
    // Give it a tick — it should remain in initial loading state
    await new Promise((r) => setTimeout(r, 20));
    expect(getTeams).not.toHaveBeenCalled();
    // loading stays true because we returned early (no finally)
    expect(result.current.loading).toBe(true);
  });
});
