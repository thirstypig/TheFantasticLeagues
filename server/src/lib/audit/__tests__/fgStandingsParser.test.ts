import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFgStandings } from "../fgStandingsParser.js";

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/fg_standings.html"),
  "utf-8",
);

describe("parseFgStandings", () => {
  const parsed = parseFgStandings(html);

  it("reads the authoritative coverage header", () => {
    expect(parsed.through).toMatch(/\d{2}\.\d{2}\.\d{2}/);
  });

  it("finds all 8 OGBA teams", () => {
    expect(Object.keys(parsed.teams)).toHaveLength(8);
    expect(parsed.teams["Demolition Lumber Co"]).toBeDefined();
  });

  it("reads RAW values from the breakdown rows, not roto points from the top grid", () => {
    // Regression guard: the top grid holds points like "8.0"/"5.0". Raw R is a
    // 3-digit count. If this ever returns a single-digit decimal the parser has
    // latched onto the wrong table.
    const r = parsed.teams["The Show"]!.R;
    expect(r).toBe("763");
    expect(r).not.toMatch(/^\d\.\d$/);
  });

  it("keeps rate stats as strings at FG's displayed precision", () => {
    expect(parsed.teams["Demolition Lumber Co"]!.AVG).toBe(".2659");
    expect(parsed.teams["Demolition Lumber Co"]!.ERA).toBe("3.43");
    expect(parsed.teams["Demolition Lumber Co"]!.WHIP).toBe("1.140");
  });

  it("maps every one of the 10 categories to the right block, not just the sampled ones", () => {
    // CAT_ORDER is zipped POSITIONALLY against the breakdown blocks in document
    // order, so an off-by-one silently swaps whole categories — HR values landing
    // under RBI, say — with no error and plausible-looking numbers. The other tests
    // in this file only sample R/AVG/ERA/WHIP/SV/K, leaving HR/RBI/SB/W unguarded,
    // which is exactly the window an off-by-one could slip through.
    const demo = parsed.teams["Demolition Lumber Co"]!;
    expect(demo.HR).toBe("167");
    expect(demo.RBI).toBe("646");
    expect(demo.SB).toBe("124");
    expect(demo.W).toBe("60");

    // A second team, because a single-team check can coincide with a shifted map.
    const show = parsed.teams["The Show"]!;
    expect(show.HR).toBe("230");
    expect(show.RBI).toBe("768");
    expect(show.SB).toBe("87");
    expect(show.W).toBe("45");
  });

  it("maps FG's SV/SO labels onto FBST's SV/K keys", () => {
    expect(parsed.teams["Demolition Lumber Co"]!.SV).toBe("58");
    expect(parsed.teams["Demolition Lumber Co"]!.K).toBe("907");
  });
});
