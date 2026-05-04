import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock at the fetchJsonApi boundary — we're testing URL/method/body
// construction in the wrappers, not the Supabase-auth / error-handling logic
// inside fetchJsonApi itself (that belongs in base.test.ts or integration tests).
vi.mock("../../../api/base", async () => {
  const actual = await vi.importActual<typeof import("../../../api/base")>(
    "../../../api/base",
  );
  return {
    ...actual,
    fetchJsonApi: vi.fn(),
    // `getPlayerCareerStats` (todo #163 cache test) calls
    // `fetchJsonPublic` (direct MLB Stats API), not `fetchJsonApi`. Mock
    // both so the cache test below can intercept network calls without
    // escaping vitest's jsdom fetch sandbox.
    fetchJsonPublic: vi.fn(),
    API_BASE: "/api",
  };
});

import { fetchJsonApi, fetchJsonPublic } from "../../../api/base";
import { ilStash, ilActivate, formatReassignmentsToast } from "../api";
import { getPlayerCareerStats, _resetCareerStatsCache } from "../../players/api";

beforeEach(() => {
  vi.clearAllMocks();
  _resetCareerStatsCache();
});

describe("ilStash", () => {
  it("POSTs to /api/transactions/il-stash with the full param payload", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      success: true,
      stashPlayerId: 42,
      addPlayerId: 100,
    });

    const result = await ilStash({
      leagueId: 20,
      teamId: 147,
      stashPlayerId: 42,
      addPlayerId: 100,
    });

    expect(fetchJsonApi).toHaveBeenCalledTimes(1);
    expect(fetchJsonApi).toHaveBeenCalledWith(
      "/api/transactions/il-stash",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          leagueId: 20,
          teamId: 147,
          stashPlayerId: 42,
          addPlayerId: 100,
        }),
      }),
    );
    expect(result).toEqual({ success: true, stashPlayerId: 42, addPlayerId: 100 });
  });

  it("forwards addMlbId / effectiveDate / reason when provided", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      success: true,
      stashPlayerId: 42,
      addPlayerId: 999,
    });

    await ilStash({
      leagueId: 20,
      teamId: 147,
      stashPlayerId: 42,
      addMlbId: 500743,
      effectiveDate: "2026-04-23",
      reason: "Backdated to match MLB IL designation date",
    });

    const [, init] = vi.mocked(fetchJsonApi).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      addMlbId: 500743,
      effectiveDate: "2026-04-23",
      reason: "Backdated to match MLB IL designation date",
    });
    expect(body).not.toHaveProperty("addPlayerId");
  });

  it("propagates server errors unchanged (no swallow, no rewrap)", async () => {
    const serverError = new Error("Team has ghost-IL player");
    vi.mocked(fetchJsonApi).mockRejectedValue(serverError);

    await expect(
      ilStash({ leagueId: 20, teamId: 147, stashPlayerId: 42, addPlayerId: 100 }),
    ).rejects.toBe(serverError);
  });
});

describe("ilActivate", () => {
  it("POSTs to /api/transactions/il-activate with the full param payload", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      success: true,
      activatePlayerId: 42,
      dropPlayerId: 1633,
    });

    const result = await ilActivate({
      leagueId: 20,
      teamId: 147,
      activatePlayerId: 42,
      dropPlayerId: 1633,
    });

    expect(fetchJsonApi).toHaveBeenCalledTimes(1);
    expect(fetchJsonApi).toHaveBeenCalledWith(
      "/api/transactions/il-activate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          leagueId: 20,
          teamId: 147,
          activatePlayerId: 42,
          dropPlayerId: 1633,
        }),
      }),
    );
    expect(result).toEqual({ success: true, activatePlayerId: 42, dropPlayerId: 1633 });
  });

  it("forwards effectiveDate / reason when provided", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      success: true,
      activatePlayerId: 42,
      dropPlayerId: 1633,
    });

    await ilActivate({
      leagueId: 20,
      teamId: 147,
      activatePlayerId: 42,
      dropPlayerId: 1633,
      effectiveDate: "2026-04-23",
      reason: "Commissioner restored prior-period state",
    });

    const [, init] = vi.mocked(fetchJsonApi).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      effectiveDate: "2026-04-23",
      reason: "Commissioner restored prior-period state",
    });
  });

  it("propagates server errors unchanged", async () => {
    const serverError = new Error(
      'effectiveDate (2026-04-23) must be after the drop player was acquired (2026-04-23)',
    );
    vi.mocked(fetchJsonApi).mockRejectedValue(serverError);

    await expect(
      ilActivate({
        leagueId: 20,
        teamId: 147,
        activatePlayerId: 42,
        dropPlayerId: 1633,
      }),
    ).rejects.toBe(serverError);
  });
});

describe("formatReassignmentsToast", () => {
  it("returns null when reassignments is undefined (no auto-resolve happened)", () => {
    expect(formatReassignmentsToast(undefined, "Claimed Mookie Betts.")).toBeNull();
  });

  it("returns null when reassignments is an empty array (no shuffle needed)", () => {
    expect(formatReassignmentsToast([], "Claimed Mookie Betts.")).toBeNull();
  });

  it("formats a single reassignment with the canonical → arrow", () => {
    const result = formatReassignmentsToast(
      [{ rosterId: 1, playerId: 10, playerName: "Trea Turner", oldSlot: "2B", newSlot: "SS" }],
      "Claimed Mookie Betts.",
    );
    expect(result).toBe("Claimed Mookie Betts. Also moved: Trea Turner 2B → SS.");
  });

  it("uses U+2192 RIGHTWARDS ARROW (not ASCII ->) — protects emoji/font compatibility", () => {
    const result = formatReassignmentsToast(
      [{ rosterId: 1, playerId: 10, playerName: "X", oldSlot: "2B", newSlot: "SS" }],
      "Claimed.",
    );
    expect(result).toContain("→"); // not "->"
    expect(result).not.toContain("->");
  });

  it("joins multiple reassignments with ', ' and ends with a single period", () => {
    const result = formatReassignmentsToast(
      [
        { rosterId: 1, playerId: 10, playerName: "Trea Turner", oldSlot: "2B", newSlot: "SS" },
        { rosterId: 2, playerId: 20, playerName: "Alec Bohm", oldSlot: "SS", newSlot: "MI" },
      ],
      "Claimed Mookie Betts.",
    );
    expect(result).toBe(
      "Claimed Mookie Betts. Also moved: Trea Turner 2B → SS, Alec Bohm SS → MI.",
    );
  });

  it("preserves the primary action label verbatim (caller controls punctuation)", () => {
    // No automatic punctuation insertion — if the caller passes a label without
    // a period, the output reflects that. Documents the caller contract.
    const result = formatReassignmentsToast(
      [{ rosterId: 1, playerId: 10, playerName: "P", oldSlot: "2B", newSlot: "SS" }],
      "Claimed Mookie Betts", // no trailing period
    );
    expect(result).toBe("Claimed Mookie Betts Also moved: P 2B → SS.");
  });

  it("flows player names with apostrophes / unicode through unchanged", () => {
    // Regression guard: the formatter must not URL-encode, HTML-escape, or
    // strip special characters. Real MLB names hit this (O'Hearn, Acuña).
    const result = formatReassignmentsToast(
      [
        { rosterId: 1, playerId: 10, playerName: "Ronald Acuña Jr.", oldSlot: "OF", newSlot: "DH" },
        { rosterId: 2, playerId: 20, playerName: "Ryan O'Hearn", oldSlot: "1B", newSlot: "CM" },
      ],
      "Claimed.",
    );
    expect(result).toContain("Ronald Acuña Jr. OF → DH");
    expect(result).toContain("Ryan O'Hearn 1B → CM");
  });

  it("flows slot codes through unchanged — no normalization or aliasing", () => {
    // Regression guard against future "helpfulness" — the formatter is dumb,
    // it does not translate "DH" → "Util" or "CM" → "Corner Infielder". Slot
    // codes must match SLOT_CODES from sports/baseball.ts exactly so the
    // toast wording matches what the table shows.
    const result = formatReassignmentsToast(
      [{ rosterId: 1, playerId: 10, playerName: "X", oldSlot: "CM", newSlot: "DH" }],
      "Claimed.",
    );
    expect(result).toContain("X CM → DH");
  });
});

// ─── getPlayerCareerStats — module-level Promise cache (todo #163) ──────
describe("getPlayerCareerStats — client-side cache", () => {
  it("dedupes concurrent calls for the same (mlbId, group) into a single fetch", async () => {
    // Two concurrent callers for the same player should share one
    // in-flight Promise. The MLB Stats API call is fired exactly once.
    // The yearByYear fetch is what we measure — the career-total fetch
    // is a follow-up await chained inside the same cached Promise.
    let resolveYbY!: (value: unknown) => void;
    const yearByYearPromise = new Promise((resolve) => {
      resolveYbY = resolve;
    });
    vi.mocked(fetchJsonPublic).mockImplementation((url: string) => {
      if (url.includes("stats=yearByYear")) return yearByYearPromise as Promise<any>;
      // Career-total follow-up — never reached if yearByYear is pending.
      return Promise.resolve({ stats: [{ splits: [] }] }) as Promise<any>;
    });

    const p1 = getPlayerCareerStats("123", "hitting");
    const p2 = getPlayerCareerStats("123", "hitting");

    // Resolve with an empty splits payload; both callers complete.
    resolveYbY({ stats: [{ splits: [] }] });
    const [r1, r2] = await Promise.all([p1, p2]);

    // Cache shares one underlying fetch — only the yearByYear endpoint
    // is hit once across both concurrent callers.
    const ybyCalls = vi.mocked(fetchJsonPublic).mock.calls.filter(([url]) =>
      String(url).includes("stats=yearByYear"),
    );
    expect(ybyCalls).toHaveLength(1);
    // Both callers receive the same resolved value object — the cache
    // memoizes the Promise resolution, not just the network round-trip.
    expect(r1).toBe(r2);
  });

  it("caches resolved values for the page lifetime — second call hits cache", async () => {
    vi.mocked(fetchJsonPublic).mockResolvedValue({ stats: [{ splits: [] }] } as any);

    await getPlayerCareerStats("456", "pitching");
    const callsAfterFirst = vi.mocked(fetchJsonPublic).mock.calls.length;

    await getPlayerCareerStats("456", "pitching");
    const callsAfterSecond = vi.mocked(fetchJsonPublic).mock.calls.length;

    // Cache hit — no additional network calls.
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });

  it("evicts on rejection so subsequent retries can refetch", async () => {
    vi.mocked(fetchJsonPublic).mockRejectedValueOnce(new Error("MLB API 503"));
    await expect(getPlayerCareerStats("789", "hitting")).rejects.toThrow("MLB API 503");

    // Retry should hit the network again, not surface the cached failure.
    vi.mocked(fetchJsonPublic).mockResolvedValue({ stats: [{ splits: [] }] } as any);
    await expect(getPlayerCareerStats("789", "hitting")).resolves.toBeDefined();
  });
});
