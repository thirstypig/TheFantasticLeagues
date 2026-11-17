import { describe, it, expect } from "vitest";
import { fmt3Avg, fmtRate, fmt2, resolveDisplayCategories } from "../sports/baseball";

describe("fmt3Avg (canonical — sports/baseball.ts)", () => {
  it("formats batting average (strips leading zero)", () => {
    expect(fmt3Avg(30, 100)).toBe(".300");
    expect(fmt3Avg(25, 100)).toBe(".250");
    expect(fmt3Avg(1, 3)).toBe(".333");
  });

  it("returns .000 for zero at-bats", () => {
    expect(fmt3Avg(0, 0)).toBe(".000");
    expect(fmt3Avg(10, 0)).toBe(".000");
  });

  it("handles 1.000 average", () => {
    expect(fmt3Avg(100, 100)).toBe("1.000");
  });

  it("rounds correctly for IEEE 754 edge cases (19/80 = .2375 → .238 not .237)", () => {
    // Regression: (19/80).toFixed(3) = "0.237" because binary representation of
    // 19/80 is 0.23749999... — below the midpoint, rounds down. Math.round integer
    // path gives 238 exactly.
    expect(fmt3Avg(19, 80)).toBe(".238");
    expect(fmt3Avg(24, 83)).toBe(".289");
  });
});

describe("fmtRate (canonical — sports/baseball.ts)", () => {
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

describe("fmt2 (canonical — sports/baseball.ts)", () => {
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

describe("resolveDisplayCategories", () => {
  const H5 = ["R", "HR", "RBI", "SB", "AVG"];
  const P5 = ["W", "SV", "ERA", "WHIP", "K"];
  const OLD_H = '["R","HR","RBI","SB","AVG","OPS","H","2B","3B","BB"]';
  const OLD_P = '["W","SV","K","ERA","WHIP","QS","HLD","IP","CG","SHO"]';
  it("old 10+10 default lists show exactly the scorable 5+5", () => {
    expect(resolveDisplayCategories(OLD_H, OLD_P)).toEqual({ hitting: H5, pitching: P5 });
  });
  it("OGBA's stored lists (S alias) show the standard 10", () => {
    expect(resolveDisplayCategories('["R","HR","RBI","SB","AVG"]', '["W","S","ERA","WHIP","K"]')).toEqual({ hitting: H5, pitching: P5 });
  });
  it("a half with nothing scorable shows its standard 5", () => {
    expect(resolveDisplayCategories('["R","HR"]', '["QS","HLD"]')).toEqual({ hitting: ["R", "HR"], pitching: P5 });
  });
  it("stored [] shows none; missing or unparseable shows the standard 5", () => {
    expect(resolveDisplayCategories('["R","AVG"]', "[]")).toEqual({ hitting: ["R", "AVG"], pitching: [] });
    expect(resolveDisplayCategories(null, "garbage")).toEqual({ hitting: H5, pitching: P5 });
    expect(resolveDisplayCategories("", '["K"]')).toEqual({ hitting: H5, pitching: ["K"] });
  });
  it("dedupes, normalizes and drops other-half keys", () => {
    expect(resolveDisplayCategories('[" hr ","r","R","W"]', '["sv","S"]')).toEqual({ hitting: ["R", "HR"], pitching: ["SV"] });
  });
  it("both halves [] fall back to all 10, as on the server", () => {
    expect(resolveDisplayCategories("[]", "[]")).toEqual({ hitting: H5, pitching: P5 });
  });
});
