// server/src/lib/audit/__tests__/report.test.ts
import { describe, it, expect } from "vitest";
import { decideVerdict, renderReport, type Coverage } from "../report.js";
import type { ClassifyResult } from "../types.js";

const fullCoverage: Coverage = {
  playersChecked: 219, playersSkipped: 0, skipReasons: [],
  sourcesReached: { fbst: true, mlb: true, fg: true, bbref: true },
  fgLegLevel: "per-player",
};
const clean: ClassifyResult = { teamName: "Skunk Dogs", explained: {}, residual: {}, causes: [] };

describe("decideVerdict", () => {
  it("passes only when residuals are empty AND coverage is complete", () => {
    expect(decideVerdict({ results: [clean], coverage: fullCoverage })).toBe("PASS");
  });

  it("passes on a classifier-shaped residual whose values are all zero", () => {
    // Regression guard: classifyTeamDelta writes EVERY stat key, so a clean
    // team arrives here with 12 zero-valued keys. A key-presence check would
    // make PASS unreachable. This test fails against that implementation.
    const zeroed: ClassifyResult = {
      teamName: "Clean Team",
      explained: {},
      residual: { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 },
      causes: [],
    };
    expect(decideVerdict({ results: [zeroed], coverage: fullCoverage })).toBe("PASS");
  });

  it("reports FINDINGS when any residual is non-zero", () => {
    const withResidual: ClassifyResult = { ...clean, residual: { RBI: -2 } };
    expect(decideVerdict({ results: [withResidual], coverage: fullCoverage })).toBe("FINDINGS");
  });

  it("is INCOMPLETE when players were skipped, even with zero residuals", () => {
    // The audit-mlb-crosscheck trap: "0 flagged" while skipping 43 players
    // reads as a clean bill of health and is not one.
    const partial: Coverage = { ...fullCoverage, playersSkipped: 43, skipReasons: ["partial ownership"] };
    expect(decideVerdict({ results: [clean], coverage: partial })).toBe("INCOMPLETE");
  });

  it("is INCOMPLETE when a source could not be reached", () => {
    const noFg: Coverage = { ...fullCoverage, sourcesReached: { ...fullCoverage.sourcesReached, fg: false } };
    expect(decideVerdict({ results: [clean], coverage: noFg })).toBe("INCOMPLETE");
  });

  it("INCOMPLETE outranks FINDINGS", () => {
    const withResidual: ClassifyResult = { ...clean, residual: { RBI: -2 } };
    const partial: Coverage = { ...fullCoverage, playersSkipped: 1, skipReasons: ["IL"] };
    expect(decideVerdict({ results: [withResidual], coverage: partial })).toBe("INCOMPLETE");
  });
});

describe("renderReport", () => {
  it("states the FG leg level so a team-level run is never read as per-player", () => {
    const md = renderReport({
      periodName: "Period 5",
      results: [clean],
      coverage: { ...fullCoverage, fgLegLevel: "team-level" },
    });
    expect(md).toMatch(/team-level/);
  });

  it("prints explained and residual side by side", () => {
    const md = renderReport({
      periodName: "Period 5",
      results: [{ teamName: "Demolition Lumber Co", explained: { HR: 3 }, residual: { RBI: -2 }, causes: [] }],
      coverage: fullCoverage,
    });
    expect(md).toMatch(/explained/i);
    expect(md).toMatch(/residual/i);
  });
});
