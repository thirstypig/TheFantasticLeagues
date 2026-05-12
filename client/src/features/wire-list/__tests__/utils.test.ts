/**
 * Unit tests for wire-list shared utilities.
 *
 * formatDeadline is used in two places (MobileWireList, WireListOwnerPage) to
 * render the period deadline in the topbar subtitle. These tests prevent:
 *   - Accidental argument-order swap (iso passed as locale, etc.)
 *   - Return of an empty or [object Object] string on valid input
 */
import { describe, it, expect } from "vitest";
import { formatDeadline } from "../utils";

describe("formatDeadline", () => {
  it("returns a non-empty string for a valid ISO datetime", () => {
    const result = formatDeadline("2026-06-15T18:00:00.000Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(5);
  });

  it("output includes the numeric day", () => {
    // 2026-06-15 is the 15th in every timezone (modulo UTC offset).
    // We accept either 14 or 15 since CI runners may be UTC.
    const result = formatDeadline("2026-06-15T18:00:00.000Z");
    expect(result).toMatch(/1[45]/);
  });

  it("does not return '[object Object]' or 'NaN'", () => {
    const result = formatDeadline("2026-12-01T12:00:00.000Z");
    expect(result).not.toContain("[object");
    expect(result).not.toContain("NaN");
  });

  it("handles a past deadline without throwing", () => {
    expect(() => formatDeadline("2025-01-01T00:00:00.000Z")).not.toThrow();
  });
});
