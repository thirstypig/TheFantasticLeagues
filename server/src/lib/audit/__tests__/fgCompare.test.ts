// server/src/lib/audit/__tests__/fgCompare.test.ts
import { describe, it, expect } from "vitest";
import { FG_COUNTING_KEYS, normalizeTeamName, toFgComparableStatLine } from "../fgCompare.js";
import { classifyTeamDelta } from "../classifier.js";
import { emptyStatLine, type StatLine } from "../types.js";

function line(p: Partial<StatLine>): StatLine {
  return { ...emptyStatLine(), ...p };
}

describe("normalizeTeamName", () => {
  it("joins FBST's trailing-period name to FanGraphs' bare one", () => {
    // The real 2026 OGBA pair. A miss here is silent: the caller falls back to
    // {}, every FG category reads 0, and that team reports a residual equal to
    // its whole season while the other seven reconcile.
    expect(normalizeTeamName("Demolition Lumber Co.")).toBe(normalizeTeamName("Demolition Lumber Co"));
  });

  it("survives the stray trailing space FBST carries", () => {
    expect(normalizeTeamName("Skunk Dogs ")).toBe("Skunk Dogs");
    expect(normalizeTeamName("  Dodger Dawgs  ")).toBe("Dodger Dawgs");
  });

  it("does not collapse two genuinely different teams", () => {
    // Guard against over-normalising into a false join — worse than no join,
    // because it silently attributes one team's totals to another.
    expect(normalizeTeamName("Devil Dawgs")).not.toBe(normalizeTeamName("Dodger Dawgs"));
  });
});

describe("toFgComparableStatLine", () => {
  it("keeps the 7 categories FanGraphs publishes", () => {
    const got = toFgComparableStatLine(
      line({ R: 713, HR: 167, RBI: 646, SB: 124, W: 58, SV: 60, K: 907 }),
    );
    expect(FG_COUNTING_KEYS.map((k) => got[k])).toEqual([713, 167, 646, 124, 58, 60, 907]);
  });

  it("zeroes the 5 rate components FanGraphs never publishes", () => {
    const got = toFgComparableStatLine(line({ AB: 4813, H: 1280, IP: 777, ER: 296, BB_H: 243, R: 713 }));
    expect({ AB: got.AB, H: got.H, IP: got.IP, ER: got.ER, BB_H: got.BB_H })
      .toEqual({ AB: 0, H: 0, IP: 0, ER: 0, BB_H: 0 });
    expect(got.R).toBe(713);
  });

  it("keeps a season PASS reachable — the regression this exists to prevent", () => {
    // fgTotals has AB/H/IP/ER/BB_H pinned at 0 because FanGraphs never
    // published them. Classifying the raw 12-key line diffs FBST's real
    // AB=4813 against that structural zero and reports a huge residual for
    // every team on every run, so the verdict is FINDINGS forever regardless
    // of correctness. Projecting first is what makes PASS attainable.
    const fbst = line({ AB: 4813, H: 1280, R: 713, HR: 167 });
    const fgAsPublished = line({ R: 713, HR: 167 }); // AB/H absent -> 0

    const unprojected = classifyTeamDelta({
      teamName: "Dodger Dawgs", fbstTotals: fbst, fgTotals: fgAsPublished, candidates: [],
    });
    expect(unprojected.residual.AB).toBe(4813); // phantom, and unfixable by any data change

    const projected = classifyTeamDelta({
      teamName: "Dodger Dawgs",
      fbstTotals: toFgComparableStatLine(fbst),
      fgTotals: fgAsPublished,
      candidates: [],
    });
    expect(Object.values(projected.residual).every((v) => v === 0)).toBe(true);
  });
});
