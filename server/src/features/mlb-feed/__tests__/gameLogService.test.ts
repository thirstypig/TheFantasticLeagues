/**
 * Unit tests for the pure helpers in gameLogService.
 *
 * Network-touching code (`getPlayerTodayLine`) is covered by the
 * integration-style suite in `myPlayersToday.test.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  extractTodayLine,
  deriveGameStatus,
  buildGameStateDesc,
} from "../services/gameLogService.js";

describe("gameLogService.extractTodayLine", () => {
  const TODAY = "2026-04-28";

  it("returns hitting line when MLB filed a hitting split for today", () => {
    const payload = {
      stats: [
        {
          group: { displayName: "hitting" },
          splits: [
            {
              date: TODAY,
              stat: { atBats: 4, hits: 2, runs: 1, homeRuns: 1, rbi: 3, stolenBases: 0, baseOnBalls: 1, strikeOuts: 0 },
            },
          ],
        },
      ],
    };
    expect(extractTodayLine(payload, TODAY)).toEqual({
      hitting: { AB: 4, H: 2, R: 1, HR: 1, RBI: 3, SB: 0, BB: 1, SO: 0 },
    });
  });

  it("returns pitching line when MLB filed a pitching split for today", () => {
    const payload = {
      stats: [
        {
          group: { displayName: "pitching" },
          splits: [
            {
              date: TODAY,
              stat: {
                inningsPitched: "7.0",
                hits: 5,
                runs: 2,
                earnedRuns: 2,
                baseOnBalls: 1,
                strikeOuts: 11,
                wins: 1,
                losses: 0,
                saves: 0,
                holds: 0,
              },
            },
          ],
        },
      ],
    };
    expect(extractTodayLine(payload, TODAY)).toEqual({
      pitching: { IP: 7, H: 5, R: 2, ER: 2, BB: 1, K: 11, W: 1 },
    });
  });

  it("returns BOTH blocks for two-way / interleague edge cases", () => {
    const payload = {
      stats: [
        {
          group: { displayName: "hitting" },
          splits: [{ date: TODAY, stat: { atBats: 4, hits: 1, runs: 0, homeRuns: 0, rbi: 0, stolenBases: 0, baseOnBalls: 0, strikeOuts: 1 } }],
        },
        {
          group: { displayName: "pitching" },
          splits: [{ date: TODAY, stat: { inningsPitched: "6.0", hits: 3, runs: 1, earnedRuns: 1, baseOnBalls: 1, strikeOuts: 7 } }],
        },
      ],
    };
    const out = extractTodayLine(payload, TODAY);
    expect(out?.hitting).toBeTruthy();
    expect(out?.pitching).toBeTruthy();
  });

  it("returns undefined for DNP (empty splits)", () => {
    const payload = {
      stats: [
        { group: { displayName: "hitting" }, splits: [] },
        { group: { displayName: "pitching" }, splits: [] },
      ],
    };
    expect(extractTodayLine(payload, TODAY)).toBeUndefined();
  });

  it("returns undefined when splits exist but none are today", () => {
    const payload = {
      stats: [
        {
          group: { displayName: "hitting" },
          splits: [
            { date: "2026-04-27", stat: { atBats: 4, hits: 1 } },
            { date: "2026-04-26", stat: { atBats: 3, hits: 0 } },
          ],
        },
      ],
    };
    expect(extractTodayLine(payload, TODAY)).toBeUndefined();
  });

  it("matches by game.gameDate prefix when split has no top-level date", () => {
    const payload = {
      stats: [
        {
          group: { displayName: "hitting" },
          splits: [
            {
              game: { gameDate: `${TODAY}T23:10:00Z` },
              stat: { atBats: 1, hits: 1, runs: 1, homeRuns: 1, rbi: 1 },
            },
          ],
        },
      ],
    };
    const out = extractTodayLine(payload, TODAY);
    expect(out?.hitting?.HR).toBe(1);
  });

  it("matches by game.officialDate (suspended/doubleheader case)", () => {
    const payload = {
      stats: [
        {
          group: { displayName: "hitting" },
          splits: [
            {
              date: "2026-04-27", // game originally scheduled yesterday
              game: { officialDate: TODAY }, // resumed today
              stat: { atBats: 2, hits: 1 },
            },
          ],
        },
      ],
    };
    const out = extractTodayLine(payload, TODAY);
    expect(out?.hitting?.H).toBe(1);
  });

  it("treats AB=0 + PA=0 as DNP (defensive replacement, etc.)", () => {
    const payload = {
      stats: [
        {
          group: { displayName: "hitting" },
          splits: [
            {
              date: TODAY,
              stat: { atBats: 0, plateAppearances: 0, hits: 0 },
            },
          ],
        },
      ],
    };
    expect(extractTodayLine(payload, TODAY)).toBeUndefined();
  });
});

describe("gameLogService.deriveGameStatus", () => {
  it("maps 'Live' → LIVE", () => {
    expect(deriveGameStatus("Live")).toBe("LIVE");
  });
  it("maps 'Final' → FINAL", () => {
    expect(deriveGameStatus("Final")).toBe("FINAL");
  });
  it("maps 'Preview' → PRE", () => {
    expect(deriveGameStatus("Preview")).toBe("PRE");
  });
  it("maps unknown / missing → PRE (default)", () => {
    expect(deriveGameStatus(undefined)).toBe("PRE");
    expect(deriveGameStatus("Postponed")).toBe("PRE");
  });
});

describe("gameLogService.buildGameStateDesc", () => {
  it("builds TOP N for live top-half innings", () => {
    expect(
      buildGameStateDesc({ gameStatus: "LIVE", inningHalf: "Top", inning: 5 }),
    ).toBe("TOP 5");
  });
  it("builds BOT N for live bottom-half innings", () => {
    expect(
      buildGameStateDesc({ gameStatus: "LIVE", inningHalf: "Bottom", inning: 9 }),
    ).toBe("BOT 9");
  });
  it("falls back to detailedState when linescore is absent", () => {
    expect(
      buildGameStateDesc({ gameStatus: "LIVE", detailedState: "In Progress" }),
    ).toBe("In Progress");
  });
  it("returns 'FINAL' for completed regulation games", () => {
    expect(buildGameStateDesc({ gameStatus: "FINAL", inning: 9 })).toBe("FINAL");
  });
  it("returns 'F/N' for extra-inning finals", () => {
    expect(buildGameStateDesc({ gameStatus: "FINAL", inning: 11 })).toBe("F/11");
  });
  it("echoes scheduled time for PRE games", () => {
    expect(
      buildGameStateDesc({ gameStatus: "PRE", scheduledTimeShort: "7:30 PM ET" }),
    ).toBe("7:30 PM ET");
  });
});
