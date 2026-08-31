import { describe, it, expect } from "vitest";
import { findPeriodsMissingReconcile, findExhaustedEvents } from "../outboxHealth.js";

/**
 * Two gaps found on 2026-08-31, both the same shape: the system trusted that an
 * event had been enqueued rather than checking the end state.
 *
 *  - Period 4 closed without an IL_FEE_RECONCILE event ever being created, so
 *    its $50 went unbilled for weeks. The only enqueue site is the PATCH
 *    /periods/:id route; closing a period any other way (a direct DB write,
 *    which is how OGBA rollovers are sometimes done) silently skips it.
 *  - Outbox rows 1 and 2 sat at attempts=5 with completedAt NULL. The drainer
 *    selects `attempts < MAX_ATTEMPTS`, so they are invisible to it forever —
 *    no retry, no alert, no reset path.
 */

const period = (id: number, status: string) => ({ id, status });
const event = (periodIds: number[], completedAt: Date | null) => ({
  payload: { periodIds },
  completedAt,
});

describe("findPeriodsMissingReconcile", () => {
  it("flags a completed period with no reconcile event at all", () => {
    const out = findPeriodsMissingReconcile([period(38, "completed")], []);
    expect(out).toEqual([38]);
  });

  it("does not flag a completed period whose event completed", () => {
    const out = findPeriodsMissingReconcile(
      [period(39, "completed")],
      [event([39], new Date("2026-08-03"))],
    );
    expect(out).toEqual([]);
  });

  it("FLAGS a completed period whose event exists but never completed", () => {
    // Rows 1 and 2: enqueued, then exhausted their retries. An event that
    // exists is not an event that ran.
    const out = findPeriodsMissingReconcile(
      [period(36, "completed")],
      [event([36], null)],
    );
    expect(out).toEqual([36]);
  });

  it("ignores periods that are not completed — active ones bill at close", () => {
    const out = findPeriodsMissingReconcile([period(41, "active")], []);
    expect(out).toEqual([]);
  });

  it("handles an event covering several periods at once", () => {
    const out = findPeriodsMissingReconcile(
      [period(36, "completed"), period(37, "completed"), period(38, "completed")],
      [event([36, 37], new Date("2026-08-03"))],
    );
    expect(out).toEqual([38]);
  });

  it("returns them in ascending order, and reports nothing when all are covered", () => {
    const evs = [event([35], new Date()), event([36], new Date())];
    expect(findPeriodsMissingReconcile([period(36, "completed"), period(35, "completed")], evs)).toEqual([]);
    expect(findPeriodsMissingReconcile([period(38, "completed"), period(37, "completed")], evs)).toEqual([37, 38]);
  });

  it("tolerates a malformed payload rather than throwing", () => {
    const out = findPeriodsMissingReconcile(
      [period(38, "completed")],
      [{ payload: {}, completedAt: null } as never],
    );
    expect(out).toEqual([38]);
  });
});

describe("findExhaustedEvents", () => {
  const ev = (id: number, attempts: number, completedAt: Date | null = null) => ({
    id, attempts, completedAt, kind: "IL_FEE_RECONCILE",
  });

  it("flags an event that hit the attempt ceiling and never completed", () => {
    expect(findExhaustedEvents([ev(1, 5)], 5).map((e) => e.id)).toEqual([1]);
  });

  it("does not flag an event still under the ceiling — it will retry", () => {
    expect(findExhaustedEvents([ev(1, 4)], 5)).toEqual([]);
  });

  it("does not flag a completed event even at the ceiling", () => {
    expect(findExhaustedEvents([ev(1, 5, new Date())], 5)).toEqual([]);
  });

  it("flags an event past the ceiling, not only exactly at it", () => {
    expect(findExhaustedEvents([ev(1, 9)], 5).map((e) => e.id)).toEqual([1]);
  });

  it("returns nothing for a healthy queue", () => {
    expect(findExhaustedEvents([ev(1, 0), ev(2, 1, new Date())], 5)).toEqual([]);
  });
});
