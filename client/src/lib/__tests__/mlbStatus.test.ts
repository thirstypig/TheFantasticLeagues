import { describe, it, expect } from "vitest";
import { isMlbIlStatus } from "../mlbStatus";

// This file mirrors `server/src/lib/__tests__/ilSlotGuard.test.ts`'s
// `isMlbIlStatus` suite. Keep the two in lockstep — if an input accepted here
// is rejected by the server (or vice versa), the UI will show incorrect
// Ghost-IL badges or gate the Place-on-IL submit button against the wrong set
// of statuses. A side-by-side diff should produce zero semantic differences.

describe("isMlbIlStatus", () => {
  // The live MLB statsapi 40-man feed returns `description` values like
  // "Injured 10-Day" / "Injured 15-Day" / "Injured 60-Day" — these are the
  // real-world strings the predicate has to accept. Pre-2026-04-22 the client
  // used `startsWith("Injured List")` which rejected every real status; that
  // bug is the regression this test exists to prevent.
  it("matches all MLB-API IL variants", () => {
    expect(isMlbIlStatus("Injured 7-Day")).toBe(true);
    expect(isMlbIlStatus("Injured 10-Day")).toBe(true);
    expect(isMlbIlStatus("Injured 15-Day")).toBe(true);
    expect(isMlbIlStatus("Injured 60-Day")).toBe(true);
  });

  // Forward-compat: if MLB ever returns the longer "Injured List N-Day" form,
  // keep treating it as a valid IL designation so we don't regress the other
  // direction next time.
  it("matches the legacy 'Injured List N-Day' form", () => {
    expect(isMlbIlStatus("Injured List 7-Day")).toBe(true);
    expect(isMlbIlStatus("Injured List 10-Day")).toBe(true);
    expect(isMlbIlStatus("Injured List 15-Day")).toBe(true);
    expect(isMlbIlStatus("Injured List 60-Day")).toBe(true);
  });

  it("rejects non-IL statuses", () => {
    expect(isMlbIlStatus("Active")).toBe(false);
    expect(isMlbIlStatus("Paternity List")).toBe(false);
    expect(isMlbIlStatus("Bereavement List")).toBe(false);
    expect(isMlbIlStatus("Restricted List")).toBe(false);
    expect(isMlbIlStatus("Suspended")).toBe(false);
    expect(isMlbIlStatus("Minor League")).toBe(false);
    expect(isMlbIlStatus("Optioned")).toBe(false);
    expect(isMlbIlStatus("Reassigned to Minors")).toBe(false);
    expect(isMlbIlStatus("Unknown")).toBe(false);
  });

  it("rejects malformed Injured strings (no day count)", () => {
    expect(isMlbIlStatus("Injured")).toBe(false);
    expect(isMlbIlStatus("Injured List")).toBe(false);
    expect(isMlbIlStatus("Injured Day")).toBe(false);
    expect(isMlbIlStatus("Injured 10")).toBe(false);
  });

  it("rejects empty / nullish", () => {
    expect(isMlbIlStatus("")).toBe(false);
    expect(isMlbIlStatus(null)).toBe(false);
    expect(isMlbIlStatus(undefined)).toBe(false);
  });

  it("is case-sensitive (guards against typo in MLB data)", () => {
    expect(isMlbIlStatus("injured 10-day")).toBe(false);
    expect(isMlbIlStatus("INJURED 10-DAY")).toBe(false);
    expect(isMlbIlStatus("injured list 10-day")).toBe(false);
  });
});
