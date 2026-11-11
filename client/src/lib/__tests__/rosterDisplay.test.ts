import { describe, it, expect } from "vitest";
import { formatEligiblePositions, ilPeriodLabel, type IlPeriod } from "../rosterDisplay";

describe("formatEligiblePositions", () => {
  it("joins every eligible position with '/'", () => {
    expect(formatEligiblePositions("C,DH", "C")).toBe("C/DH");
  });
  it("dedupes primary + posList and puts the primary first", () => {
    expect(formatEligiblePositions("OF,2B,OF", "2B")).toBe("2B/OF");
  });
  it("orders the rest by the app's POS_ORDER", () => {
    expect(formatEligiblePositions("SS,DH,C,1B", "SS")).toBe("SS/C/1B/DH");
  });
  it("accepts '/' and spaces as separators and upper-cases", () => {
    expect(formatEligiblePositions("lf/rf, ss", "ss")).toBe("SS/LF/RF");
  });
  it("falls back to the primary, then an em dash", () => {
    expect(formatEligiblePositions("", "OF")).toBe("OF");
    expect(formatEligiblePositions(undefined, undefined)).toBe("—");
  });
});

const periods: IlPeriod[] = [
  { id: 1, name: "Period 1", status: "completed", startDate: "2026-03-25T00:00:00Z" },
  { id: 2, name: "Period 2", status: "completed", startDate: "2026-04-19T00:00:00Z" },
  { id: 5, name: "Period 5", status: "completed", startDate: "2026-06-01T00:00:00Z" },
  { id: 6, name: "Period 6", status: "active", startDate: "2026-07-01T00:00:00Z" },
];

describe("ilPeriodLabel", () => {
  it('"Since Period N" for the period containing ilSince', () => {
    expect(ilPeriodLabel("2026-06-10T00:00:00Z", periods)).toBe("Since Period 5");
  });
  it("a stint starting exactly on a period start belongs to that period", () => {
    expect(ilPeriodLabel("2026-04-19T00:00:00Z", periods)).toBe("Since Period 2");
  });
  it('"This period" when the containing period is the active one', () => {
    expect(ilPeriodLabel("2026-07-04T00:00:00Z", periods)).toBe("This period");
  });
  it('"Before Period 1" when the date precedes the first period', () => {
    expect(ilPeriodLabel("2026-03-01T00:00:00Z", periods)).toBe("Before Period 1");
  });
  it('"—" when ilSince is null/undefined/unparseable or there are no periods', () => {
    expect(ilPeriodLabel(null, periods)).toBe("—");
    expect(ilPeriodLabel(undefined, periods)).toBe("—");
    expect(ilPeriodLabel("garbage", periods)).toBe("—");
    expect(ilPeriodLabel("2026-06-10T00:00:00Z", [])).toBe("—");
  });
  it("is order-independent", () => {
    expect(ilPeriodLabel("2026-06-10T00:00:00Z", [...periods].reverse())).toBe("Since Period 5");
  });
});
