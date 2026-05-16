import { describe, it, expect } from "vitest";
import { toNum, fmt2, fmt3Avg, fmtRate, yyyyMmDd, addDays } from "../base";

describe("toNum", () => {
  it("converts numeric strings", () => {
    expect(toNum("42")).toBe(42);
    expect(toNum("3.14")).toBe(3.14);
  });

  it("returns 0 for non-finite values", () => {
    expect(toNum(NaN)).toBe(0);
    expect(toNum(Infinity)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum(null)).toBe(0);
    expect(toNum("abc")).toBe(0);
  });
});

describe("fmt2", () => {
  it("formats to 2 decimal places", () => {
    expect(fmt2(3.14159)).toBe("3.14");
    expect(fmt2(100)).toBe("100.00");
    expect(fmt2(0)).toBe("0.00");
  });

  it("returns empty string for non-finite", () => {
    expect(fmt2(NaN)).toBe("");
    expect(fmt2(Infinity)).toBe("");
  });
});

describe("fmt3Avg", () => {
  it("formats batting average (strips leading zero)", () => {
    expect(fmt3Avg(30, 100)).toBe(".300");
    expect(fmt3Avg(1, 3)).toBe(".333");
    expect(fmt3Avg(25, 100)).toBe(".250");
  });

  it("returns .000 for zero at-bats", () => {
    expect(fmt3Avg(0, 0)).toBe(".000");
    expect(fmt3Avg(10, 0)).toBe(".000");
  });

  it("handles 1.000 average", () => {
    expect(fmt3Avg(100, 100)).toBe("1.000");
  });

  it("rounds correctly for IEEE 754 edge cases (19/80 = .2375 → .238 not .237)", () => {
    expect(fmt3Avg(19, 80)).toBe(".238");
    expect(fmt3Avg(24, 83)).toBe(".289");
  });
});

describe("fmtRate", () => {
  it("formats rate stats (strips leading zero)", () => {
    expect(fmtRate(0.3)).toBe(".300");
    expect(fmtRate(0.25)).toBe(".250");
  });

  it("keeps leading digit for values >= 1", () => {
    expect(fmtRate(1.234)).toBe("1.234");
    expect(fmtRate(3.5)).toBe("3.500");
  });

  it("returns .000 for non-finite values", () => {
    expect(fmtRate(NaN)).toBe(".000");
    expect(fmtRate(Infinity)).toBe(".000");
  });
});

describe("yyyyMmDd", () => {
  it("formats date as YYYY-MM-DD", () => {
    const d = new Date(2024, 3, 15); // April 15, 2024
    expect(yyyyMmDd(d)).toBe("2024-04-15");
  });

  it("pads single-digit month and day", () => {
    const d = new Date(2024, 0, 5); // Jan 5, 2024
    expect(yyyyMmDd(d)).toBe("2024-01-05");
  });

  it("handles December 31", () => {
    const d = new Date(2024, 11, 31);
    expect(yyyyMmDd(d)).toBe("2024-12-31");
  });
});

describe("addDays", () => {
  it("adds positive days", () => {
    const d = new Date(2024, 0, 1); // Jan 1
    const result = addDays(d, 5);
    expect(result.getDate()).toBe(6);
    expect(result.getMonth()).toBe(0);
  });

  it("subtracts days with negative delta", () => {
    const d = new Date(2024, 0, 10); // Jan 10
    const result = addDays(d, -3);
    expect(result.getDate()).toBe(7);
  });

  it("handles month boundary", () => {
    const d = new Date(2024, 0, 31); // Jan 31
    const result = addDays(d, 1);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(1);
  });

  it("does not mutate original date", () => {
    const d = new Date(2024, 0, 1);
    const original = d.getTime();
    addDays(d, 10);
    expect(d.getTime()).toBe(original);
  });
});
