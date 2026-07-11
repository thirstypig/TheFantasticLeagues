import { describe, it, expect } from "vitest";
import { ipToOuts, sumGameLog, reconcile, realMlbId, zeroLine, type GameLogSplit } from "../audit-mlb-crosscheck.js";

describe("realMlbId — synthetic Ohtani-pitcher id mapping", () => {
  it("maps the synthetic pitcher row (real + 1,000,000) back to the real id", () => {
    expect(realMlbId(1660271)).toBe(660271); // Ohtani synthetic pitcher → real
  });
  it("leaves normal ids untouched", () => {
    expect(realMlbId(657277)).toBe(657277); // Logan Webb
  });
});

describe("ipToOuts", () => {
  it("parses statsapi thirds notation (100.1 = 100⅓ = 301 outs)", () => {
    expect(ipToOuts("100.1")).toBe(301);
    expect(ipToOuts("120.2")).toBe(362);
    expect(ipToOuts("7.0")).toBe(21);
  });
  it("rounds FBST decimal innings to outs (100.333 → 301)", () => {
    expect(ipToOuts(100.333)).toBe(301);
    expect(ipToOuts(661.3)).toBe(1984); // 661.3*3 = 1983.9 → 1984
  });
});

describe("sumGameLog — as-of-date cap (the E-Rodriguez trap)", () => {
  // Two starts; the 07-10 game is statsapi's real-time lead over FBST's frontier.
  const splits: GameLogSplit[] = [
    { date: "2026-07-05", stat: { earnedRuns: 2, inningsPitched: "6.0", strikeOuts: 5, wins: 0, saves: 0, baseOnBalls: 1, hits: 6 } },
    { date: "2026-07-10", stat: { earnedRuns: 2, inningsPitched: "1.0", strikeOuts: 0, wins: 0, saves: 0, baseOnBalls: 0, hits: 3 } },
  ];

  it("excludes games after the FBST frontier so statsapi's lead can't fake a gap", () => {
    const { line, games } = sumGameLog(splits, "2026-07-09", "pitching");
    expect(games).toBe(1);
    expect(line.ER).toBe(2);        // only the 07-05 game
    expect(line.outs).toBe(18);     // 6.0 IP
  });

  it("includes the same-day game once the frontier catches up", () => {
    const { line, games } = sumGameLog(splits, "2026-07-10", "pitching");
    expect(games).toBe(2);
    expect(line.ER).toBe(4);
    expect(line.outs).toBe(21);     // 6.0 + 1.0
  });

  it("sums hitting fields for the hitting group", () => {
    const hit: GameLogSplit[] = [
      { date: "2026-06-01", stat: { runs: 1, homeRuns: 1, rbi: 3, stolenBases: 0, hits: 2, atBats: 4 } },
      { date: "2026-06-02", stat: { runs: 0, homeRuns: 0, rbi: 0, stolenBases: 1, hits: 1, atBats: 3 } },
    ];
    const { line } = sumGameLog(hit, "2026-06-02", "hitting");
    expect(line).toMatchObject({ R: 1, HR: 1, RBI: 3, SB: 1, H: 3, AB: 7 });
  });
});

describe("reconcile — self-aligning prefix match (kills the PSD-vs-PSP frontier bug)", () => {
  const pitchLog: GameLogSplit[] = [
    { date: "2026-07-05", stat: { earnedRuns: 2, inningsPitched: "6.0", strikeOuts: 5, wins: 0, saves: 0, baseOnBalls: 1, hits: 6 } },
    { date: "2026-07-10", stat: { earnedRuns: 2, inningsPitched: "1.0", strikeOuts: 0, wins: 0, saves: 0, baseOnBalls: 0, hits: 3 } },
  ];

  it("consistent (as-of lag) when FBST equals a cumulative prefix", () => {
    // FBST as-of after game 1 only (statsapi already has game 2 = the real-time lead)
    const fbst = { ...zeroLine(), ER: 2, outs: 18, K: 5, BB_H: 7 };
    const rec = reconcile(fbst, pitchLog, "pitching");
    expect(rec.status).toBe("consistent");
    expect(rec.matchedGames).toBe(1);
    expect(rec.totalGames).toBe(2);
    expect(rec.diffVsFinal.find((d) => d.stat === "ER")).toEqual({ stat: "ER", fbst: 2, mlb: 4 });
  });

  it("consistent with zero lag when FBST equals the full total", () => {
    const fbst = { ...zeroLine(), ER: 4, outs: 21, K: 5, BB_H: 10 };
    const rec = reconcile(fbst, pitchLog, "pitching");
    expect(rec.status).toBe("consistent");
    expect(rec.matchedGames).toBe(rec.totalGames);
  });

  it("in-progress (transient) when FBST is sandwiched WITHIN a live game — the James Wood case", () => {
    // Between prefix[1] (ER2/outs18/BB_H7) and prefix[2] (ER4/outs21/BB_H10): mid-game snapshot.
    const fbst = { ...zeroLine(), ER: 3, outs: 20, K: 5, BB_H: 8 };
    const rec = reconcile(fbst, pitchLog, "pitching");
    expect(rec.status).toBe("in-progress");
  });

  it("inconsistent (real bug) when FBST exceeds the season total — fits no point in time", () => {
    const hitLog: GameLogSplit[] = [
      { date: "d1", stat: { hits: 1, atBats: 4, runs: 0, homeRuns: 0, rbi: 0, stolenBases: 0 } },
      { date: "d2", stat: { hits: 2, atBats: 3, runs: 0, homeRuns: 0, rbi: 0, stolenBases: 0 } },
    ];
    const fbst = { ...zeroLine(), H: 5, AB: 5 }; // H 5 > season total 3 → impossible
    const rec = reconcile(fbst, hitLog, "hitting");
    expect(rec.status).toBe("inconsistent");
    expect(rec.matchedGames).toBeNull();
    expect(rec.diffVsFinal.map((d) => d.stat).sort()).toEqual(["AB", "H"]);
  });
});
