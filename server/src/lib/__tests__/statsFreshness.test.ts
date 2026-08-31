import { describe, it, expect } from "vitest";
import { classifyFreshness, findActivePeriodStaleness, STALE_AFTER_HOURS } from "../statsFreshness.js";

const NOW = new Date("2026-08-30T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

describe("classifyFreshness", () => {
  it("counts a row written within the window as fresh", () => {
    const r = classifyFreshness([{ syncedAt: hoursAgo(1) }], { now: NOW });
    expect(r.fresh).toBe(1);
    expect(r.stale).toBe(0);
    expect(r.neverSynced).toBe(0);
  });

  it("counts a row older than the window as stale", () => {
    const r = classifyFreshness([{ syncedAt: hoursAgo(48) }], { now: NOW });
    expect(r.stale).toBe(1);
    expect(r.fresh).toBe(0);
  });

  it("treats a NULL syncedAt as never-synced, never as fresh", () => {
    // The whole point of the nullable column: pre-migration rows are unknown.
    // Counting them fresh would make the alarm report all-clear on day one.
    const r = classifyFreshness([{ syncedAt: null }], { now: NOW });
    expect(r.neverSynced).toBe(1);
    expect(r.fresh).toBe(0);
  });

  it("reports never-synced rows as needing attention alongside stale ones", () => {
    const r = classifyFreshness(
      [{ syncedAt: null }, { syncedAt: hoursAgo(48) }, { syncedAt: hoursAgo(1) }],
      { now: NOW },
    );
    expect(r.needsAttention).toBe(2);
    expect(r.total).toBe(3);
  });

  it("reports the oldest observed sync so an alert can say how far behind we are", () => {
    const r = classifyFreshness(
      [{ syncedAt: hoursAgo(5) }, { syncedAt: hoursAgo(99) }, { syncedAt: hoursAgo(30) }],
      { now: NOW },
    );
    expect(r.oldestSyncedAt).toEqual(hoursAgo(99));
  });

  it("leaves oldestSyncedAt null when nothing has ever synced", () => {
    const r = classifyFreshness([{ syncedAt: null }], { now: NOW });
    expect(r.oldestSyncedAt).toBeNull();
  });

  it("is boundary-exclusive: exactly at the threshold is not yet stale", () => {
    const r = classifyFreshness([{ syncedAt: hoursAgo(STALE_AFTER_HOURS) }], { now: NOW });
    expect(r.stale).toBe(0);
    expect(r.fresh).toBe(1);
  });

  it("honours an explicit maxAgeHours override", () => {
    const rows = [{ syncedAt: hoursAgo(6) }];
    expect(classifyFreshness(rows, { now: NOW, maxAgeHours: 4 }).stale).toBe(1);
    expect(classifyFreshness(rows, { now: NOW, maxAgeHours: 8 }).stale).toBe(0);
  });

  it("an empty set needs no attention and is not an error", () => {
    const r = classifyFreshness([], { now: NOW });
    expect(r.total).toBe(0);
    expect(r.needsAttention).toBe(0);
    expect(r.oldestSyncedAt).toBeNull();
  });
});

describe("findActivePeriodStaleness", () => {
  const fakePrisma = (period: { id: number; name: string } | null, rows: { syncedAt: Date | null }[]) => ({
    period: { findFirst: async () => period },
    playerStatsPeriod: { findMany: async () => rows },
  });

  it("returns null when there is no active period — off-season must not alert", async () => {
    const r = await findActivePeriodStaleness(fakePrisma(null, []), 20, { now: NOW });
    expect(r).toBeNull();
  });

  it("reports the active period's freshness, naming the period for the alert text", async () => {
    const r = await findActivePeriodStaleness(
      fakePrisma({ id: 41, name: "Period 7" }, [{ syncedAt: null }, { syncedAt: hoursAgo(1) }]),
      20,
      { now: NOW },
    );
    expect(r?.periodId).toBe(41);
    expect(r?.periodName).toBe("Period 7");
    expect(r?.neverSynced).toBe(1);
    expect(r?.needsAttention).toBe(1);
  });
});
