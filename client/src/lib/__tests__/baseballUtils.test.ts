import { describe, it, expect } from "vitest";
import {
  POS_ORDER,
  POS_SCORE,
  getPrimaryPosition,
  sortByPosition,
  isCIEligible,
  isMIEligible,
  getLastName,
} from "../baseballUtils";

describe("POS_ORDER", () => {
  it("has 10 positions in canonical order", () => {
    expect(POS_ORDER).toEqual([
      "C", "1B", "2B", "3B", "SS", "MI", "CI", "OF", "P", "DH",
    ]);
  });
});

describe("POS_SCORE", () => {
  it("assigns increasing scores in order", () => {
    expect(POS_SCORE["C"]).toBe(0);
    expect(POS_SCORE["1B"]).toBe(1);
    expect(POS_SCORE["MI"]).toBe(5);
    expect(POS_SCORE["CI"]).toBe(6);
    expect(POS_SCORE["P"]).toBe(8);
    expect(POS_SCORE["DH"]).toBe(9);
  });

  it("C sorts before SS", () => {
    expect(POS_SCORE["C"]).toBeLessThan(POS_SCORE["SS"]);
  });

  it("P sorts before DH", () => {
    expect(POS_SCORE["P"]).toBeLessThan(POS_SCORE["DH"]);
  });
});

describe("getPrimaryPosition", () => {
  it("returns first position from comma-separated list", () => {
    expect(getPrimaryPosition("SS,2B")).toBe("SS");
    expect(getPrimaryPosition("OF,1B,DH")).toBe("OF");
  });

  it("returns single position (normalizes SP→P)", () => {
    expect(getPrimaryPosition("C")).toBe("C");
    expect(getPrimaryPosition("SP")).toBe("P");
    expect(getPrimaryPosition("RP")).toBe("P");
    expect(getPrimaryPosition("CF")).toBe("OF");
    expect(getPrimaryPosition("LF")).toBe("OF");
    expect(getPrimaryPosition("RF")).toBe("OF");
  });

  it("defaults to DH for undefined/empty", () => {
    expect(getPrimaryPosition(undefined)).toBe("DH");
    expect(getPrimaryPosition("")).toBe("DH");
  });

  it("normalizes CM to 1B/3B", () => {
    expect(getPrimaryPosition("CM")).toBe("1B/3B");
  });

  it("normalizes MI to 2B/SS", () => {
    expect(getPrimaryPosition("MI")).toBe("2B/SS");
  });

  it("trims whitespace and normalizes", () => {
    expect(getPrimaryPosition(" SP , RP ")).toBe("P");
  });
});

describe("sortByPosition", () => {
  it("sorts C before SS", () => {
    const a = { positions: "C" };
    const b = { positions: "SS" };
    expect(sortByPosition(a, b)).toBeLessThan(0);
  });

  it("sorts P (SP) before DH", () => {
    const a = { positions: "SP" }; // normalizes to P
    const b = { positions: "DH" };
    expect(sortByPosition(a, b)).toBeLessThan(0);
  });

  it("returns 0 for same position", () => {
    const a = { positions: "OF" };
    const b = { positions: "OF" };
    expect(sortByPosition(a, b)).toBe(0);
  });

  it("handles split positions (1B/3B sorts by first part)", () => {
    const cm = { positions: "CM" }; // maps to 1B/3B -> sorts by 1B
    const ss = { positions: "SS" };
    expect(sortByPosition(cm, ss)).toBeLessThan(0); // 1B < SS
  });

  it("handles undefined positions (default to DH)", () => {
    const a = { positions: undefined } as { positions?: string };
    const b = { positions: "C" };
    expect(sortByPosition(a, b)).toBeGreaterThan(0); // DH > C
  });

  it("sorts a full roster correctly", () => {
    const roster = [
      { positions: "DH" },
      { positions: "P" },
      { positions: "C" },
      { positions: "OF" },
      { positions: "SS" },
    ];
    const sorted = [...roster].sort(sortByPosition);
    expect(sorted.map((p) => p.positions)).toEqual([
      "C", "SS", "OF", "P", "DH",
    ]);
  });

  it("handles unknown positions (sorted to end)", () => {
    const a = { positions: "UTIL" }; // unknown -> score 99
    const b = { positions: "C" }; // score 0
    expect(sortByPosition(a, b)).toBeGreaterThan(0);
  });
});

describe("isCIEligible", () => {
  it("returns true for 1B", () => {
    expect(isCIEligible("1B")).toBe(true);
  });

  it("returns true for 3B", () => {
    expect(isCIEligible("3B")).toBe(true);
  });

  it("returns true for multi-position with 1B", () => {
    expect(isCIEligible("OF,1B")).toBe(true);
  });

  it("returns false for non-corner positions", () => {
    expect(isCIEligible("SS")).toBe(false);
    expect(isCIEligible("2B")).toBe(false);
    expect(isCIEligible("OF")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isCIEligible(undefined)).toBe(false);
  });
});

describe("isMIEligible", () => {
  it("returns true for 2B", () => {
    expect(isMIEligible("2B")).toBe(true);
  });

  it("returns true for SS", () => {
    expect(isMIEligible("SS")).toBe(true);
  });

  it("returns true for multi-position with SS", () => {
    expect(isMIEligible("3B,SS")).toBe(true);
  });

  it("returns false for non-middle positions", () => {
    expect(isMIEligible("1B")).toBe(false);
    expect(isMIEligible("3B")).toBe(false);
    expect(isMIEligible("OF")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isMIEligible(undefined)).toBe(false);
  });
});

describe("getLastName", () => {
  it("extracts last name from full name", () => {
    expect(getLastName("Mike Trout")).toBe("Trout");
    expect(getLastName("Shohei Ohtani")).toBe("Ohtani");
  });

  it("handles single name", () => {
    expect(getLastName("Ichiro")).toBe("Ichiro");
  });

  it("handles suffixes like Jr. and III", () => {
    expect(getLastName("Ronald Acuña Jr.")).toBe("Acuña Jr.");
    expect(getLastName("Ken Griffey Jr")).toBe("Griffey Jr");
    expect(getLastName("Adley Rutschman III")).toBe("Rutschman III");
  });

  it("returns empty string for undefined/empty", () => {
    expect(getLastName(undefined)).toBe("");
    expect(getLastName("")).toBe("");
  });

  it("handles extra whitespace", () => {
    expect(getLastName("  Juan  Soto  ")).toBe("Soto");
  });
});
