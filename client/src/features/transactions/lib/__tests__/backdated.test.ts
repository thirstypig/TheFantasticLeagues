import { describe, it, expect } from "vitest";
import { isBackdated, filterBackdated, BACKDATED_THRESHOLD_MS } from "../backdated";
import type { TransactionEvent } from "../../api";

const baseEvent: TransactionEvent = {
  id: 1,
  leagueId: 1,
  teamId: 10,
  playerId: 100,
  type: "ADD",
  amount: null,
  relatedTransactionId: null,
  submittedAt: "2026-04-15T18:00:00.000Z",
  processedAt: null,
  status: "APPROVED",
};

describe("isBackdated", () => {
  it("returns false when no submittedAt or createdAt", () => {
    expect(isBackdated({ effDate: "2026-04-10T00:00:00Z" })).toBe(false);
  });

  it("returns false when no effDate", () => {
    expect(isBackdated({ submittedAt: "2026-04-15T18:00:00Z" })).toBe(false);
  });

  it("returns false for a normal forward-dated move (effDate = tomorrow PT midnight, submitted now)", () => {
    // Submitted at noon UTC on Apr 15; effDate = tomorrow midnight UTC.
    // effDate is AFTER submittedAt — clearly not backdated.
    expect(
      isBackdated({
        effDate: "2026-04-16T00:00:00Z",
        submittedAt: "2026-04-15T12:00:00Z",
      }),
    ).toBe(false);
  });

  it("returns false for a same-day move (effDate UTC midnight, submitted later same day)", () => {
    // Common normal case: submitted at 23:00 UTC on Apr 15, effDate snaps to
    // Apr 15 midnight UTC. Difference is 23h — under the 24h threshold.
    expect(
      isBackdated({
        effDate: "2026-04-15T00:00:00Z",
        submittedAt: "2026-04-15T23:00:00Z",
      }),
    ).toBe(false);
  });

  it("returns true when effDate is several days before submittedAt", () => {
    expect(
      isBackdated({
        effDate: "2026-04-10T00:00:00Z",
        submittedAt: "2026-04-15T18:00:00Z",
      }),
    ).toBe(true);
  });

  it("returns true at exactly threshold + 1ms past 24h", () => {
    const submitted = new Date("2026-04-15T12:00:00.000Z");
    const eff = new Date(submitted.getTime() - BACKDATED_THRESHOLD_MS - 1);
    expect(
      isBackdated({
        effDate: eff.toISOString(),
        submittedAt: submitted.toISOString(),
      }),
    ).toBe(true);
  });

  it("returns false when effDate is exactly at the threshold (boundary case)", () => {
    const submitted = new Date("2026-04-15T12:00:00.000Z");
    const eff = new Date(submitted.getTime() - BACKDATED_THRESHOLD_MS);
    expect(
      isBackdated({
        effDate: eff.toISOString(),
        submittedAt: submitted.toISOString(),
      }),
    ).toBe(false);
  });

  it("falls back to createdAt when submittedAt is absent", () => {
    expect(
      isBackdated({
        effDate: "2026-04-01T00:00:00Z",
        createdAt: "2026-04-15T18:00:00Z",
      }),
    ).toBe(true);
  });

  it("accepts Date objects, not just ISO strings", () => {
    expect(
      isBackdated({
        effDate: new Date("2026-04-01T00:00:00Z"),
        submittedAt: new Date("2026-04-15T18:00:00Z"),
      }),
    ).toBe(true);
  });

  it("returns false for invalid date strings (no speculation)", () => {
    expect(
      isBackdated({
        effDate: "not-a-date",
        submittedAt: "2026-04-15T18:00:00Z",
      }),
    ).toBe(false);
  });

  it("returns false for null tx", () => {
    expect(isBackdated(null)).toBe(false);
    expect(isBackdated(undefined)).toBe(false);
  });
});

describe("filterBackdated", () => {
  it("returns only backdated events", () => {
    const events: TransactionEvent[] = [
      {
        ...baseEvent,
        id: 1,
        effDate: "2026-04-10T00:00:00Z",
        submittedAt: "2026-04-15T18:00:00Z",
      },
      {
        ...baseEvent,
        id: 2,
        effDate: "2026-04-16T00:00:00Z",
        submittedAt: "2026-04-15T18:00:00Z",
      },
      {
        ...baseEvent,
        id: 3,
        effDate: "2026-03-01T00:00:00Z",
        submittedAt: "2026-04-15T18:00:00Z",
      },
    ];

    const result = filterBackdated(events);
    expect(result.map((e) => e.id)).toEqual([1, 3]);
  });

  it("returns empty array when nothing is backdated", () => {
    const events: TransactionEvent[] = [
      {
        ...baseEvent,
        id: 1,
        effDate: "2026-04-16T00:00:00Z",
        submittedAt: "2026-04-15T18:00:00Z",
      },
    ];
    expect(filterBackdated(events)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(filterBackdated([])).toEqual([]);
  });
});
