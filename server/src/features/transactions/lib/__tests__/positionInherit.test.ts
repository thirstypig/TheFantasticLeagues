import { describe, it, expect } from "vitest";
import { isEligibleForSlot, assertAddEligibleForDropSlot } from "../positionInherit.js";
import { isRosterRuleError } from "../../../../lib/rosterRuleError.js";

describe("isEligibleForSlot", () => {
  it("matches primary position to its own slot", () => {
    expect(isEligibleForSlot("SS", "SS")).toBe(true);
    expect(isEligibleForSlot("2B", "2B")).toBe(true);
    expect(isEligibleForSlot("OF", "OF")).toBe(true);
    expect(isEligibleForSlot("C", "C")).toBe(true);
  });

  it("matches MI to 2B or SS primaries", () => {
    expect(isEligibleForSlot("2B", "MI")).toBe(true);
    expect(isEligibleForSlot("SS", "MI")).toBe(true);
    expect(isEligibleForSlot("2B,SS", "MI")).toBe(true);
  });

  it("matches CM to 1B or 3B primaries", () => {
    expect(isEligibleForSlot("1B", "CM")).toBe(true);
    expect(isEligibleForSlot("3B", "CM")).toBe(true);
  });

  it("MI does NOT match 1B or 3B players", () => {
    expect(isEligibleForSlot("1B", "MI")).toBe(false);
    expect(isEligibleForSlot("3B", "MI")).toBe(false);
  });

  it("CM does NOT match 2B or SS players", () => {
    expect(isEligibleForSlot("2B", "CM")).toBe(false);
    expect(isEligibleForSlot("SS", "CM")).toBe(false);
  });

  it("handles multi-position posList", () => {
    // Mookie-style: OF + 2B → MI-eligible, OF-eligible
    expect(isEligibleForSlot("OF,2B", "MI")).toBe(true);
    expect(isEligibleForSlot("OF,2B", "OF")).toBe(true);
    expect(isEligibleForSlot("OF,2B", "3B")).toBe(false);
  });

  it("collapses SP/RP/CL to P slot", () => {
    expect(isEligibleForSlot("SP", "P")).toBe(true);
    expect(isEligibleForSlot("RP", "P")).toBe(true);
    expect(isEligibleForSlot("CL", "P")).toBe(true);
    expect(isEligibleForSlot("TWP", "P")).toBe(true);
    expect(isEligibleForSlot("SP,RP", "P")).toBe(true);
  });

  it("pitchers are NOT eligible for hitter slots", () => {
    expect(isEligibleForSlot("SP", "2B")).toBe(false);
    expect(isEligibleForSlot("RP", "OF")).toBe(false);
  });

  it("ignores whitespace and case in posList", () => {
    expect(isEligibleForSlot("  ss , 2b  ", "MI")).toBe(true);
    expect(isEligibleForSlot("ss", "SS")).toBe(true);
  });

  it("returns false for empty / missing posList", () => {
    expect(isEligibleForSlot("", "SS")).toBe(false);
    expect(isEligibleForSlot(",", "SS")).toBe(false);
  });

  it("returns false when targetSlot is empty", () => {
    expect(isEligibleForSlot("SS", "")).toBe(false);
  });

  it("handles OF variants (LF/CF/RF)", () => {
    expect(isEligibleForSlot("LF", "OF")).toBe(true);
    expect(isEligibleForSlot("CF", "OF")).toBe(true);
    expect(isEligibleForSlot("RF", "OF")).toBe(true);
  });
});

describe("assertAddEligibleForDropSlot", () => {
  it("passes when add player can fill drop's slot", () => {
    expect(() =>
      assertAddEligibleForDropSlot({ name: "Player A", posList: "SS" }, "MI"),
    ).not.toThrow();
  });

  it("throws POSITION_INELIGIBLE when not eligible", () => {
    try {
      assertAddEligibleForDropSlot({ name: "Juan Soto", posList: "OF" }, "SS");
      throw new Error("should have thrown");
    } catch (err) {
      expect(isRosterRuleError(err)).toBe(true);
      if (isRosterRuleError(err)) {
        expect(err.code).toBe("POSITION_INELIGIBLE");
        expect(err.message).toContain("Juan Soto");
        expect(err.message).toContain("SS");
        expect(err.metadata.dropSlot).toBe("SS");
      }
    }
  });
});
