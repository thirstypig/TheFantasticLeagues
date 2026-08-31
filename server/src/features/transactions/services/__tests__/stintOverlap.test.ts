import { describe, it, expect } from "vitest";
import { stintOverlapsPeriod } from "../ilFeeService.js";

/**
 * Q17(b) — "presence-during-period → full fee" — was decided when stints began
 * and ended on arbitrary days, where "touched the period" was a fair proxy for
 * "occupied a slot".
 *
 * Commissioner backdating broke that assumption: activations are stamped at
 * 00:00 on a period's FIRST day, so an inclusive end boundary billed a full
 * period at zero days of occupancy. Three of the four stints repaired on
 * 2026-08-31 hit exactly that — Palencia into P3, Priester into P4, Henderson
 * into P5.
 *
 * Commissioner decision 2026-08-31: a stint that ends on a period's first day
 * does NOT owe that period. The start boundary stays inclusive — a stint that
 * BEGINS on the last day of a period did occupy a slot that day.
 */

const P = { startDate: new Date("2026-05-17T00:00:00Z"), endDate: new Date("2026-06-06T00:00:00Z") };
const s = (startedAt: string, endedAt: string | null) => ({
  startedAt: new Date(startedAt),
  endedAt: endedAt ? new Date(endedAt) : null,
});

describe("stintOverlapsPeriod", () => {
  it("bills a stint running through the whole period", () => {
    expect(stintOverlapsPeriod(s("2026-04-01T00:00:00Z", "2026-07-01T00:00:00Z"), P)).toBe(true);
  });

  it("does NOT bill a stint that ends on the period's first day", () => {
    // Palencia: activated 05-17, P3 starts 05-17 → zero days on IL in P3.
    expect(stintOverlapsPeriod(s("2026-04-19T00:00:00Z", "2026-05-17T00:00:00Z"), P)).toBe(false);
  });

  it("bills a stint that ends one day INTO the period", () => {
    expect(stintOverlapsPeriod(s("2026-04-19T00:00:00Z", "2026-05-18T00:00:00Z"), P)).toBe(true);
  });

  it("still bills a stint that BEGINS on the period's last day", () => {
    // Start boundary stays inclusive — that day was genuinely occupied.
    expect(stintOverlapsPeriod(s("2026-06-06T00:00:00Z", null), P)).toBe(true);
  });

  it("does not bill a stint starting after the period ends", () => {
    expect(stintOverlapsPeriod(s("2026-06-07T00:00:00Z", null), P)).toBe(false);
  });

  it("bills an open stint that began before the period", () => {
    expect(stintOverlapsPeriod(s("2026-04-01T00:00:00Z", null), P)).toBe(true);
  });

  it("does not bill a stint entirely before the period", () => {
    expect(stintOverlapsPeriod(s("2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z"), P)).toBe(false);
  });
});
