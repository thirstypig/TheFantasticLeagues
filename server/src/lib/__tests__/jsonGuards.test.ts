import { describe, it, expect } from "vitest";
import { isPosGamesRecord } from "../jsonGuards.js";

describe("isPosGamesRecord", () => {
  // ── truthy cases ────────────────────────────────────────────────
  it("returns true for a valid position-to-games map", () => {
    expect(isPosGamesRecord({ OF: 45, "1B": 12, C: 0 })).toBe(true);
  });

  it("accepts an empty object (zero positions tracked yet)", () => {
    // Empty is valid; callers treat it as "no real data" via key-count check.
    expect(isPosGamesRecord({})).toBe(true);
  });

  it("accepts integer GP counts", () => {
    expect(isPosGamesRecord({ SS: 80, "2B": 5 })).toBe(true);
  });

  it("accepts float GP counts (API occasionally returns 0.0)", () => {
    expect(isPosGamesRecord({ DH: 1.0, P: 30.5 })).toBe(true);
  });

  // ── falsy cases — Prisma.JsonValue alternatives ─────────────────
  it("returns false for null", () => {
    expect(isPosGamesRecord(null)).toBe(false);
  });

  it("returns false for a JSON array (wrong shape)", () => {
    expect(isPosGamesRecord([{ OF: 10 }])).toBe(false);
  });

  it("returns false for a plain string", () => {
    expect(isPosGamesRecord("OF")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isPosGamesRecord(42)).toBe(false);
  });

  it("returns false for a boolean", () => {
    expect(isPosGamesRecord(true)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isPosGamesRecord(undefined)).toBe(false);
  });

  // ── corrupt data guards ─────────────────────────────────────────
  it("returns false when any value is a string (manual fixup wrote bad data)", () => {
    expect(isPosGamesRecord({ OF: "45" })).toBe(false);
  });

  it("returns false when any value is null", () => {
    expect(isPosGamesRecord({ OF: null })).toBe(false);
  });

  it("returns false when any value is NaN", () => {
    expect(isPosGamesRecord({ OF: NaN })).toBe(false);
  });

  it("returns false when any value is Infinity", () => {
    // Number.isFinite(Infinity) === false — the guard rejects it.
    expect(isPosGamesRecord({ OF: Infinity })).toBe(false);
  });

  it("returns false for a nested object (shouldn't happen but guards against it)", () => {
    expect(isPosGamesRecord({ OF: { games: 10 } })).toBe(false);
  });

  it("rejects mixed valid + invalid values — one bad field fails the whole record", () => {
    expect(isPosGamesRecord({ OF: 45, "1B": "bad" })).toBe(false);
  });
});
