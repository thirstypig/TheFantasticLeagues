import { describe, it, expect, vi } from "vitest";
import { buildIlWindows, wasOnIlAtPeriodStart } from "../ilWindows.js";

// Silence logger.warn in tests so orphaned-activate assertions don't pollute output.
vi.mock("../logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Helper: build a minimal event object accepted by buildIlWindows.
function ev(
  playerId: number | null,
  transactionType: string | null,
  effDate: Date | null,
) {
  return { playerId, transactionType, effDate };
}

const D = (iso: string) => new Date(iso);

// ── buildIlWindows ────────────────────────────────────────────────

describe("buildIlWindows", () => {
  it("returns an empty map for empty event list", () => {
    const result = buildIlWindows([]);
    expect(result.size).toBe(0);
  });

  it("skips events with null playerId or null effDate", () => {
    const result = buildIlWindows([
      ev(null, "IL_STASH", D("2026-04-01T00:00:00.000Z")),
      ev(1, "IL_STASH", null),
    ]);
    expect(result.size).toBe(0);
  });

  it("builds a single closed window for a stash → activate pair", () => {
    const result = buildIlWindows([
      ev(1, "IL_STASH",    D("2026-04-01T00:00:00.000Z")),
      ev(1, "IL_ACTIVATE", D("2026-04-15T00:00:00.000Z")),
    ]);
    const windows = result.get(1)!;
    expect(windows).toHaveLength(1);
    expect(windows[0].startDate).toEqual(D("2026-04-01T00:00:00.000Z"));
    expect(windows[0].endDate).toEqual(D("2026-04-15T00:00:00.000Z"));
  });

  it("handles multiple stints per player (stash → activate → stash → activate)", () => {
    const result = buildIlWindows([
      ev(1, "IL_STASH",    D("2026-04-01T00:00:00.000Z")),
      ev(1, "IL_ACTIVATE", D("2026-04-10T00:00:00.000Z")),
      ev(1, "IL_STASH",    D("2026-04-20T00:00:00.000Z")),
      ev(1, "IL_ACTIVATE", D("2026-05-01T00:00:00.000Z")),
    ]);
    const windows = result.get(1)!;
    expect(windows).toHaveLength(2);
    expect(windows[0]).toEqual({
      startDate: D("2026-04-01T00:00:00.000Z"),
      endDate:   D("2026-04-10T00:00:00.000Z"),
    });
    expect(windows[1]).toEqual({
      startDate: D("2026-04-20T00:00:00.000Z"),
      endDate:   D("2026-05-01T00:00:00.000Z"),
    });
  });

  it("leaves an open (null endDate) window for a stash with no matching activate", () => {
    const result = buildIlWindows([
      ev(1, "IL_STASH", D("2026-04-01T00:00:00.000Z")),
    ]);
    const windows = result.get(1)!;
    expect(windows).toHaveLength(1);
    expect(windows[0].startDate).toEqual(D("2026-04-01T00:00:00.000Z"));
    expect(windows[0].endDate).toBeNull();
  });

  it("duplicate IL_STASH before activate only opens one window (second stash is ignored)", () => {
    // The guard `if (!openStart.has(pid))` prevents the second stash from
    // overwriting the first stash date, so we get exactly one window.
    const result = buildIlWindows([
      ev(1, "IL_STASH",    D("2026-04-01T00:00:00.000Z")),
      ev(1, "IL_STASH",    D("2026-04-05T00:00:00.000Z")), // duplicate — should be skipped
      ev(1, "IL_ACTIVATE", D("2026-04-15T00:00:00.000Z")),
    ]);
    const windows = result.get(1)!;
    expect(windows).toHaveLength(1);
    // startDate must be from the FIRST stash, not the skipped second one
    expect(windows[0].startDate).toEqual(D("2026-04-01T00:00:00.000Z"));
    expect(windows[0].endDate).toEqual(D("2026-04-15T00:00:00.000Z"));
  });

  it("silently ignores an orphaned IL_ACTIVATE (no preceding IL_STASH)", () => {
    // No window should be created; the logger.warn is called but we don't assert it.
    const result = buildIlWindows([
      ev(1, "IL_ACTIVATE", D("2026-04-15T00:00:00.000Z")),
    ]);
    expect(result.has(1)).toBe(false);
  });

  it("handles multiple players with independent stints", () => {
    const result = buildIlWindows([
      ev(1, "IL_STASH",    D("2026-04-01T00:00:00.000Z")),
      ev(2, "IL_STASH",    D("2026-04-03T00:00:00.000Z")),
      ev(1, "IL_ACTIVATE", D("2026-04-10T00:00:00.000Z")),
      // player 2 stays on IL (open stint)
    ]);
    const w1 = result.get(1)!;
    expect(w1).toHaveLength(1);
    expect(w1[0].endDate).toEqual(D("2026-04-10T00:00:00.000Z"));

    const w2 = result.get(2)!;
    expect(w2).toHaveLength(1);
    expect(w2[0].endDate).toBeNull();
  });

  it("ignores unrecognised transaction types", () => {
    const result = buildIlWindows([
      ev(1, "ADD",        D("2026-04-01T00:00:00.000Z")),
      ev(1, "DROP",       D("2026-04-05T00:00:00.000Z")),
      ev(1, null,         D("2026-04-07T00:00:00.000Z")),
    ]);
    expect(result.has(1)).toBe(false);
  });
});

// ── wasOnIlAtPeriodStart ──────────────────────────────────────────

describe("wasOnIlAtPeriodStart", () => {
  it("returns false for a player not in the map", () => {
    const map = new Map();
    expect(wasOnIlAtPeriodStart(99, D("2026-04-19T00:00:00.000Z"), map)).toBe(false);
  });

  it("returns false when the player's IL window ended before periodStart", () => {
    const map = buildIlWindows([
      ev(1, "IL_STASH",    D("2026-04-01T00:00:00.000Z")),
      ev(1, "IL_ACTIVATE", D("2026-04-10T00:00:00.000Z")),
    ]);
    // periodStart is after the window closed
    expect(wasOnIlAtPeriodStart(1, D("2026-04-15T00:00:00.000Z"), map)).toBe(false);
  });

  it("returns true when the player has an open (null endDate) window that started before periodStart", () => {
    const map = buildIlWindows([
      ev(1, "IL_STASH", D("2026-04-01T00:00:00.000Z")),
    ]);
    expect(wasOnIlAtPeriodStart(1, D("2026-04-19T00:00:00.000Z"), map)).toBe(true);
  });

  it("returns true when periodStart falls exactly on window startDate (boundary — inclusive)", () => {
    const periodStart = D("2026-04-19T00:00:00.000Z");
    const map = buildIlWindows([
      ev(1, "IL_STASH",    periodStart),
      ev(1, "IL_ACTIVATE", D("2026-04-30T00:00:00.000Z")),
    ]);
    // startDate <= periodStart (equality) and endDate > periodStart → true
    expect(wasOnIlAtPeriodStart(1, periodStart, map)).toBe(true);
  });

  it("returns false when periodStart equals window endDate (exclusive upper bound)", () => {
    const endDate    = D("2026-04-19T00:00:00.000Z");
    const map = buildIlWindows([
      ev(1, "IL_STASH",    D("2026-04-01T00:00:00.000Z")),
      ev(1, "IL_ACTIVATE", endDate),
    ]);
    // endDate is NOT > periodStart when they are equal → false
    expect(wasOnIlAtPeriodStart(1, endDate, map)).toBe(false);
  });

  it("returns true when periodStart is mid-window (closed window covers it)", () => {
    const map = buildIlWindows([
      ev(1, "IL_STASH",    D("2026-04-01T00:00:00.000Z")),
      ev(1, "IL_ACTIVATE", D("2026-05-01T00:00:00.000Z")),
    ]);
    expect(wasOnIlAtPeriodStart(1, D("2026-04-19T00:00:00.000Z"), map)).toBe(true);
  });

  it("returns true if ANY of multiple windows covers periodStart", () => {
    // First window closed before periodStart; second window covers it.
    const map = buildIlWindows([
      ev(1, "IL_STASH",    D("2026-04-01T00:00:00.000Z")),
      ev(1, "IL_ACTIVATE", D("2026-04-10T00:00:00.000Z")),
      ev(1, "IL_STASH",    D("2026-04-15T00:00:00.000Z")),
      ev(1, "IL_ACTIVATE", D("2026-05-01T00:00:00.000Z")),
    ]);
    expect(wasOnIlAtPeriodStart(1, D("2026-04-19T00:00:00.000Z"), map)).toBe(true);
  });

  it("returns false when periodStart is before all windows (player not yet on IL)", () => {
    const map = buildIlWindows([
      ev(1, "IL_STASH",    D("2026-04-20T00:00:00.000Z")),
      ev(1, "IL_ACTIVATE", D("2026-04-30T00:00:00.000Z")),
    ]);
    // periodStart is Apr 19, stash is Apr 20 → startDate > periodStart → false
    expect(wasOnIlAtPeriodStart(1, D("2026-04-19T00:00:00.000Z"), map)).toBe(false);
  });
});
