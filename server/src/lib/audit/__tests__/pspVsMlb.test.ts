import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  diffScored, formatDiffs, ipToOuts, pspToScored, roleFor, sumGameLogs, zeroScored,
  type GameLogSplit,
} from "../pspVsMlb.js";

// Real statsapi game log (Ohtani 2026), trimmed: 3 starts in Period 1, and
// 4 games 07-17..07-20 including the 07-19 doubleheader (two entries, one date).
const fx = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/mlb_gamelog_660271_2026.json", import.meta.url)), "utf8")) as {
  pitching: GameLogSplit[]; hitting: GameLogSplit[];
};
const P1 = { start: "2026-03-25", end: "2026-04-18" };
const JULY = { start: "2026-07-17", end: "2026-07-20" };
const NL = new Set([109, 112, 113, 115, 119, 120, 121, 134, 135, 137, 138, 143, 144, 146, 158]);

describe("ipToOuts", () => {
  it("reads MLB's thirds notation", () => {
    expect(ipToOuts("6.0")).toBe(18);
    expect(ipToOuts("5.2")).toBe(17);
    expect(ipToOuts("0.1")).toBe(1);
    expect(ipToOuts(null)).toBe(0);
  });
});

describe("sumGameLogs on a real game log", () => {
  it("sums pitching over the window: W, K, outs, ER, and walks + hits allowed", () => {
    const s = sumGameLogs(fx, P1, NL, "pitching");
    expect(s).toEqual({ ...zeroScored(), W: 2, SV: 0, K: 18, outs: 54, ER: 1, BB_H: 13 });
  });

  it("does not count a pitcher's batters-faced AB/H as his hitting", () => {
    // The pitching log carries atBats/hits AGAINST him; only the hitting log is his batting.
    const s = sumGameLogs({ hitting: [], pitching: fx.pitching }, P1, NL, "both");
    expect(s.AB).toBe(0);
    expect(s.H).toBe(0);
  });

  it("counts both games of a doubleheader", () => {
    const s = sumGameLogs(fx, { start: "2026-07-19", end: "2026-07-19" }, NL, "hitting");
    expect(s).toMatchObject({ AB: 9, H: 3, R: 1, RBI: 2 });
  });

  it("window dates are inclusive at both ends", () => {
    expect(sumGameLogs(fx, JULY, NL, "hitting")).toMatchObject({ AB: 17, H: 3, R: 1, HR: 0, RBI: 2, SB: 0 });
    expect(sumGameLogs(fx, { start: "2026-07-18", end: "2026-07-19" }, NL, "hitting").AB).toBe(9);
  });

  it("skips games for a team outside the counted league (NL-only rule)", () => {
    const AL_ONLY = new Set([147]);
    expect(sumGameLogs(fx, JULY, AL_ONLY, "hitting")).toEqual(zeroScored());
  });

  it("counts every team when the league scores all of MLB", () => {
    expect(sumGameLogs(fx, JULY, null, "hitting").AB).toBe(17);
  });

  it("drops one half for a two-way split row", () => {
    const both = sumGameLogs(fx, { start: "2026-03-25", end: "2026-07-31" }, NL, "both");
    const hit = sumGameLogs(fx, { start: "2026-03-25", end: "2026-07-31" }, NL, "hitting");
    const pit = sumGameLogs(fx, { start: "2026-03-25", end: "2026-07-31" }, NL, "pitching");
    expect(hit.K + hit.W + hit.outs).toBe(0);
    expect(pit.AB + pit.H + pit.R).toBe(0);
    expect({ ...hit, W: pit.W, SV: pit.SV, K: pit.K, outs: pit.outs, ER: pit.ER, BB_H: pit.BB_H }).toEqual(both);
  });
});

describe("roleFor", () => {
  it("synthetic pitcher id keeps pitching only", () => {
    expect(roleFor(1660271, new Set([660271, 1660271]))).toBe("pitching");
  });
  it("real id keeps hitting only when its synthetic twin is in the period", () => {
    expect(roleFor(660271, new Set([660271, 1660271]))).toBe("hitting");
  });
  it("real id without a twin keeps everything", () => {
    expect(roleFor(660271, new Set([660271]))).toBe("both");
    expect(roleFor(592450, new Set([592450]))).toBe("both");
  });
});

describe("pspToScored + diffScored", () => {
  const row = { AB: 17, H: 3, R: 1, HR: 0, RBI: 2, SB: 0, W: 2, SV: 0, K: 18, IP: 18, ER: 1, BB_H: 13 };

  it("stored IP in true thirds compares exactly against outs", () => {
    expect(pspToScored({ ...row, IP: 5 + 2 / 3 }).outs).toBe(17);
    expect(pspToScored({ ...row, IP: 6.333333 }).outs).toBe(19);
  });

  it("no diffs when the stored row equals the game-log sum", () => {
    const h = sumGameLogs(fx, JULY, NL, "hitting");
    const p = sumGameLogs(fx, P1, NL, "pitching");
    const mlb = { ...h, W: p.W, SV: p.SV, K: p.K, outs: p.outs, ER: p.ER, BB_H: p.BB_H };
    expect(diffScored(pspToScored(row), mlb)).toEqual([]);
  });

  it("reports each disagreeing category, innings in MLB notation", () => {
    const mlb = { ...pspToScored(row), HR: 1, outs: 55 };
    const d = diffScored(pspToScored(row), mlb);
    expect(d).toEqual([{ stat: "HR", fbst: 0, mlb: 1 }, { stat: "outs", fbst: 54, mlb: 55 }]);
    expect(formatDiffs(d)).toBe("HR 0≠1, IP 18.0≠18.1");
  });
});
