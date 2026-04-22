import { describe, it, expect } from "vitest";
import { RosterRuleError, isRosterRuleError } from "../rosterRuleError.js";

describe("RosterRuleError", () => {
  it("carries code and message", () => {
    const err = new RosterRuleError("GHOST_IL", "Team has a ghost-IL player");
    expect(err.code).toBe("GHOST_IL");
    expect(err.message).toBe("Team has a ghost-IL player");
    expect(err.name).toBe("RosterRuleError");
  });

  it("accepts optional metadata for richer audit", () => {
    const err = new RosterRuleError("OWNERSHIP_CONFLICT", "window overlaps", {
      playerId: 42,
      conflictingRosterId: 7,
    });
    expect(err.metadata.playerId).toBe(42);
    expect(err.metadata.conflictingRosterId).toBe(7);
  });

  it("defaults metadata to empty object when omitted", () => {
    const err = new RosterRuleError("ROSTER_CAP", "at cap");
    expect(err.metadata).toEqual({});
  });

  it("is a real Error subclass (for stack traces, instanceof checks)", () => {
    const err = new RosterRuleError("NOT_MLB_IL", "player is active");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RosterRuleError);
    expect(typeof err.stack).toBe("string");
  });
});

describe("isRosterRuleError", () => {
  it("returns true for a RosterRuleError instance", () => {
    const err = new RosterRuleError("DROP_REQUIRED", "need a drop");
    expect(isRosterRuleError(err)).toBe(true);
  });

  it("returns false for a plain Error", () => {
    expect(isRosterRuleError(new Error("nope"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isRosterRuleError(null)).toBe(false);
    expect(isRosterRuleError(undefined)).toBe(false);
    expect(isRosterRuleError("NOT_MLB_IL")).toBe(false);
    expect(isRosterRuleError({ code: "NOT_MLB_IL", message: "x" })).toBe(false);
  });

  it("narrows the error type correctly", () => {
    const err: unknown = new RosterRuleError("IDOR", "wrong league");
    if (isRosterRuleError(err)) {
      // Type narrowing: TS now knows err.code exists
      expect(err.code).toBe("IDOR");
    } else {
      throw new Error("type guard should have narrowed");
    }
  });
});
