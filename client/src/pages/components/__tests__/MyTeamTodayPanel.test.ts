import { describe, it, expect } from "vitest";
import {
  parseInningsToThirds,
  formatThirdsToIp,
  sumHitting,
  sumPitching,
} from "../MyTeamTodayPanel";
import type { RosterStatsPlayer } from "../../home/types";

// ─── parseInningsToThirds + formatThirdsToIp ────────────────────────────

describe("parseInningsToThirds", () => {
  it("converts whole innings", () => {
    expect(parseInningsToThirds("5.0")).toBe(15);
    expect(parseInningsToThirds("0.0")).toBe(0);
    expect(parseInningsToThirds("9.0")).toBe(27);
  });

  it("converts thirds correctly (.1 = +1, .2 = +2)", () => {
    expect(parseInningsToThirds("5.1")).toBe(16);
    expect(parseInningsToThirds("5.2")).toBe(17);
    expect(parseInningsToThirds("6.2")).toBe(20);
  });

  it("accepts numeric IP and rounds via .toFixed(1)", () => {
    expect(parseInningsToThirds(5)).toBe(15);
    expect(parseInningsToThirds(5.1)).toBe(16);
  });

  it("returns 0 for null / undefined / empty", () => {
    expect(parseInningsToThirds(undefined)).toBe(0);
    expect(parseInningsToThirds(null as unknown as string)).toBe(0);
    expect(parseInningsToThirds("")).toBe(0);
  });

  it("returns 0 for malformed strings rather than NaN", () => {
    expect(parseInningsToThirds("abc")).toBe(0);
    expect(parseInningsToThirds("5.x")).toBe(15); // whole still parses
  });
});

describe("formatThirdsToIp", () => {
  it("formats whole innings", () => {
    expect(formatThirdsToIp(0)).toBe("0.0");
    expect(formatThirdsToIp(15)).toBe("5.0");
    expect(formatThirdsToIp(27)).toBe("9.0");
  });

  it("formats partial innings as .1 / .2", () => {
    expect(formatThirdsToIp(16)).toBe("5.1");
    expect(formatThirdsToIp(17)).toBe("5.2");
    expect(formatThirdsToIp(20)).toBe("6.2");
  });

  it("returns 0.0 for negative or non-finite input", () => {
    expect(formatThirdsToIp(-1)).toBe("0.0");
    expect(formatThirdsToIp(NaN)).toBe("0.0");
    expect(formatThirdsToIp(Infinity)).toBe("0.0");
  });
});

describe("IP roundtrip — the bug a unit test prevents", () => {
  // 5.1 + 6.2 = 5⅓ + 6⅔ = 12 — NOT 11.3 (which is what naive
  // string-decimal arithmetic gives you). The thirds-aware sum is
  // the whole point of the helper pair.
  it("5.1 + 6.2 = 12.0", () => {
    const total = parseInningsToThirds("5.1") + parseInningsToThirds("6.2");
    expect(formatThirdsToIp(total)).toBe("12.0");
  });

  it("5.1 + 5.1 + 5.1 = 16.0 (three thirds wrap to one whole)", () => {
    const total =
      parseInningsToThirds("5.1") +
      parseInningsToThirds("5.1") +
      parseInningsToThirds("5.1");
    expect(formatThirdsToIp(total)).toBe("16.0");
  });

  it("5.2 + 5.2 = 11.1 (two ⅔ + one whole)", () => {
    const total = parseInningsToThirds("5.2") + parseInningsToThirds("5.2");
    expect(formatThirdsToIp(total)).toBe("11.1");
  });
});

// ─── sumHitting / sumPitching ───────────────────────────────────────────

function hitter(name: string, stats: Partial<NonNullable<RosterStatsPlayer["hitting"]>>): RosterStatsPlayer {
  return {
    playerName: name, mlbId: 1, mlbTeam: "LAD", position: "OF", isPitcher: false,
    gameToday: true, gameStatus: "Final", opponent: "SD", homeAway: "home", gameTime: "",
    hitting: { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, BB: 0, K: 0, ...stats },
    pitching: null, thumbnail: null,
  };
}

function pitcher(name: string, stats: Partial<NonNullable<RosterStatsPlayer["pitching"]>>): RosterStatsPlayer {
  return {
    playerName: name, mlbId: 2, mlbTeam: "LAD", position: "P", isPitcher: true,
    gameToday: true, gameStatus: "Final", opponent: "SD", homeAway: "away", gameTime: "",
    hitting: null,
    pitching: { IP: "0.0", H: 0, R: 0, ER: 0, K: 0, BB: 0, W: 0, L: 0, SV: 0, ...stats },
    thumbnail: null,
  };
}

function nonPlayer(name: string, isPitcher: boolean): RosterStatsPlayer {
  return {
    playerName: name, mlbId: 3, mlbTeam: "LAD", position: isPitcher ? "P" : "OF",
    isPitcher, gameToday: false, gameStatus: "", opponent: "",
    homeAway: "", gameTime: "",
    hitting: null, pitching: null, thumbnail: null,
  };
}

describe("sumHitting", () => {
  it("returns zeros for empty input", () => {
    expect(sumHitting([])).toEqual({ AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0 });
  });

  it("sums counting stats across multiple hitters", () => {
    const result = sumHitting([
      hitter("a", { AB: 4, H: 2, R: 1, HR: 1, RBI: 3, SB: 0 }),
      hitter("b", { AB: 5, H: 3, R: 2, HR: 0, RBI: 1, SB: 2 }),
    ]);
    expect(result).toEqual({ AB: 9, H: 5, R: 3, HR: 1, RBI: 4, SB: 2 });
  });

  it("skips players with no hitting line (DNP)", () => {
    const result = sumHitting([
      hitter("a", { AB: 4, H: 2 }),
      nonPlayer("b", false), // hitting === null
    ]);
    expect(result.AB).toBe(4);
    expect(result.H).toBe(2);
  });

  it("treats missing stat fields as zero", () => {
    const result = sumHitting([hitter("a", { AB: 3 })]);
    expect(result).toEqual({ AB: 3, H: 0, R: 0, HR: 0, RBI: 0, SB: 0 });
  });
});

describe("sumPitching", () => {
  it("returns zeros for empty input", () => {
    expect(sumPitching([])).toEqual({
      IPThirds: 0, K: 0, BB: 0, ER: 0, W: 0, SV: 0,
    });
  });

  it("sums counting stats and aggregates IP via thirds", () => {
    const result = sumPitching([
      pitcher("a", { IP: "5.1", K: 7, BB: 2, ER: 1, W: 1 }),
      pitcher("b", { IP: "6.2", K: 4, BB: 1, ER: 0, SV: 1 }),
    ]);
    expect(result.IPThirds).toBe(16 + 20); // 5⅓ + 6⅔ thirds = 36
    expect(formatThirdsToIp(result.IPThirds)).toBe("12.0");
    expect(result.K).toBe(11);
    expect(result.BB).toBe(3);
    expect(result.ER).toBe(1);
    expect(result.W).toBe(1);
    expect(result.SV).toBe(1);
  });

  it("skips pitchers who didn't appear (no pitching line)", () => {
    const result = sumPitching([
      pitcher("a", { IP: "5.0", K: 3 }),
      nonPlayer("b", true),
    ]);
    expect(formatThirdsToIp(result.IPThirds)).toBe("5.0");
    expect(result.K).toBe(3);
  });

  it("handles a long-relief day where multiple pitchers all contributed", () => {
    // 3 pitchers, ⅔ + ⅓ + ⅔ = 1⅔ on top of (1+0+0) = 2⅔ total → 2.2
    const result = sumPitching([
      pitcher("a", { IP: "1.2" }),
      pitcher("b", { IP: "0.1" }),
      pitcher("c", { IP: "0.2" }),
    ]);
    expect(formatThirdsToIp(result.IPThirds)).toBe("2.2");
  });
});
