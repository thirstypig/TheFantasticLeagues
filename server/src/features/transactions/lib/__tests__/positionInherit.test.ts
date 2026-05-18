import { describe, it, expect } from "vitest";
import { isEligibleForSlot, assertAddEligibleForDropSlot, negotiateInheritedSlot } from "../positionInherit.js";
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

describe("negotiateInheritedSlot", () => {
  it("returns dropSlot directly when add player is eligible for it", () => {
    // Direct fit: 2B player dropped from 2B slot → new 2B player keeps 2B
    expect(negotiateInheritedSlot("2B", "2B", "2B")).toBe("2B");
    // Direct fit via composite: 2B,SS dropped from MI → new 2B player keeps MI
    expect(negotiateInheritedSlot("2B", "MI", "2B,SS")).toBe("MI");
  });

  it("negotiates to shared slot when dropSlot is incompatible — key bug scenario", () => {
    // Drop player (2B,SS) sitting in SS; new player only plays 2B.
    // SS is not in new player's eligible slots, but 2B is shared → return 2B.
    expect(negotiateInheritedSlot("2B", "SS", "2B,SS")).toBe("2B");
  });

  it("resolves to MI composite slot when both players are MI-eligible", () => {
    // Drop player (SS) sitting in 3B (legacy slot); new player is 2B,SS.
    // 3B is not shared; first shared slot in new player's set is MI (2B→MI).
    expect(negotiateInheritedSlot("2B,SS", "3B", "SS")).toBe("MI");
  });

  it("falls back to dropSlot when no eligible slot is shared", () => {
    // C-only drop vs 2B-only add: no overlap → return original dropSlot unchanged
    expect(negotiateInheritedSlot("2B", "C", "C")).toBe("C");
  });

  it("does not cross pitcher/hitter boundary", () => {
    // SP drop in P slot vs 2B add: no shared slot → fall back to P
    expect(negotiateInheritedSlot("2B", "P", "SP")).toBe("P");
    // OF add vs SP drop: no shared slot either
    expect(negotiateInheritedSlot("OF", "P", "RP")).toBe("P");
  });

  it("handles empty dropPosList gracefully — falls through to dropSlot", () => {
    // If the drop player's posList was not loaded, no indirect slot can be found
    expect(negotiateInheritedSlot("2B", "SS", "")).toBe("SS");
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
