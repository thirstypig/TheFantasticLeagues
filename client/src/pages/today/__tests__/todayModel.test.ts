import { describe, it, expect } from "vitest";
import {
  normalizeStandings,
  rankRows,
  summarizeRank,
  standingsPreview,
  periodHeader,
  orderTonight,
  formatLine,
  type TodayStandingsRow,
  type MyPlayerToday,
} from "../todayModel";
import type { PeriodInfo } from "../../../features/periods/api";

const row = (teamId: number, periodPoints: number[], teamName = `T${teamId}`): TodayStandingsRow => ({
  teamId,
  teamName,
  totalPoints: periodPoints.reduce((a, b) => a + b, 0),
  periodPoints,
});

const period = (over: Partial<PeriodInfo>): PeriodInfo => ({
  id: 1,
  name: "Period 1",
  startDate: "2026-06-01T00:00:00.000Z",
  endDate: "2026-06-20T00:00:00.000Z",
  status: "active",
  isActive: true,
  leagueId: 1,
  seasonId: 1,
  ...over,
});

const mp = (over: Partial<MyPlayerToday>): MyPlayerToday => ({
  playerName: "P",
  mlbId: 1,
  mlbTeam: "NYY",
  gameTime: "2026-06-14T23:05:00Z",
  opponent: "BOS",
  homeAway: "home",
  ...over,
});

describe("normalizeStandings", () => {
  it("reads periodPoints, falls back to P{id} columns, sorts by total desc", () => {
    const rows = normalizeStandings({
      periodIds: [10, 11],
      rows: [
        { teamId: 1, teamName: "A", periodPoints: [1, 2] },
        { teamId: 2, teamName: "B", P10: "5", P11: 4, teamCode: "BEE" },
      ],
    });
    expect(rows.map((r) => r.teamId)).toEqual([2, 1]);
    expect(rows[0]).toMatchObject({ totalPoints: 9, periodPoints: [5, 4], teamCode: "BEE" });
    expect(rows[1].totalPoints).toBe(3);
  });
});

describe("rankRows", () => {
  it("ranks by total and ties share a rank", () => {
    const ranked = rankRows([row(1, [10]), row(2, [10]), row(3, [5]), row(4, [20])]);
    expect(ranked.map((r) => [r.teamId, r.rank]).sort()).toEqual([[1, 2], [2, 2], [3, 4], [4, 1]]);
  });
});

describe("summarizeRank", () => {
  it("ties share a rank and the gap says tied", () => {
    const s = summarizeRank([row(1, [10]), row(2, [10]), row(3, [5])], 2, ["P1"])!;
    expect(s.rank).toBe(1);
    expect(s.gap).toEqual({ kind: "tied", points: 0, teamName: "T1" });
  });
  it("trend compares against totals before the last period", () => {
    // before last: t1=10, t2=20 -> me(t1) rank 2; now t1=10+20=30 vs t2=20+0 -> rank 1
    const rows = [row(1, [10, 20]), row(2, [20, 0])];
    const s = summarizeRank(rows, 1, ["P1", "P2"])!;
    expect(s.rank).toBe(1);
    expect(s.trend).toBe(1);
    expect(s.trendSince).toBe("P1");
  });
  it("no trend with a single period", () => {
    const s = summarizeRank([row(1, [10]), row(2, [5])], 2, ["P1"])!;
    expect(s.trend).toBeNull();
    expect(s.trendSince).toBeNull();
    expect(s.gap).toEqual({ kind: "behind", points: 5, teamName: "T1" });
  });
  it("leader shows the gap ahead of 2nd", () => {
    const s = summarizeRank([row(1, [12.5]), row(2, [10]), row(3, [1])], 1, ["P1"])!;
    expect(s.gap).toEqual({ kind: "ahead", points: 2.5, teamName: "T2" });
    expect(s.teamCount).toBe(3);
    expect(s.totalPoints).toBe(12.5);
  });
  it("returns null rank when the user has no team", () => {
    expect(summarizeRank([row(1, [1])], null, ["P1"])).toBeNull();
    expect(summarizeRank([row(1, [1])], 99, ["P1"])).toBeNull();
  });
});

describe("standingsPreview", () => {
  const rows = Array.from({ length: 8 }, (_, i) => row(i + 1, [80 - i * 10]));
  it("adds the user's row below the top 5", () => {
    const p = standingsPreview(rows, 7);
    expect(p.top).toHaveLength(5);
    expect(p.mine?.teamId).toBe(7);
    expect(p.mine?.rank).toBe(7);
  });
  it("omits mine when the user is in the top 5", () => {
    expect(standingsPreview(rows, 3).mine).toBeNull();
  });
});

describe("periodHeader", () => {
  const now = new Date("2026-06-14T18:00:00");
  it("labels days left, 1 day left and last day", () => {
    expect(periodHeader([period({ endDate: "2026-06-20T00:00:00.000Z" })], now)).toEqual({
      name: "Period 1",
      label: "6 days left",
    });
    expect(periodHeader([period({ endDate: "2026-06-15" })], now)?.label).toBe("1 day left");
    expect(periodHeader([period({ endDate: "2026-06-14" })], now)?.label).toBe("last day");
    expect(periodHeader([period({ endDate: "2026-06-10" })], now)?.label).toBe("last day");
  });
  it("returns null without an active period", () => {
    expect(periodHeader([period({ status: "completed" })], now)).toBeNull();
    expect(periodHeader([], now)).toBeNull();
  });
});

describe("orderTonight", () => {
  it("puts live first then upcoming by time then final", () => {
    const players = [
      mp({ playerName: "fin", gameStatus: "FINAL" }),
      mp({ playerName: "late", gameStatus: "PRE", gameTime: "2026-06-14T23:00:00Z" }),
      mp({ playerName: "live", gameStatus: "LIVE" }),
      mp({ playerName: "early", gameStatus: "PRE", gameTime: "2026-06-14T17:00:00Z" }),
      mp({ playerName: "extra", gameStatus: "FINAL" }),
    ];
    const r = orderTonight(players, 4);
    expect(r.shown.map((p) => p.playerName)).toEqual(["live", "early", "late", "fin"]);
    expect(r.more).toBe(1);
  });
});

describe("formatLine", () => {
  it("formats hitters and pitchers", () => {
    const h = { AB: 4, H: 2, R: 0, HR: 0, RBI: 2, SB: 0 };
    expect(formatLine(mp({ line: { hitting: h } }))).toBe("2-4, 2 RBI");
    expect(formatLine(mp({ line: { hitting: { ...h, AB: 1, H: 1, HR: 1, RBI: 0 } } }))).toBe("1-1, HR");
    expect(formatLine(mp({ line: { hitting: { ...h, RBI: 0 } } }))).toBe("2-4");
    expect(formatLine(mp({ line: { pitching: { IP: 6.1, H: 4, R: 2, ER: 2, BB: 1, K: 8 } } }))).toBe("6.1 IP, 2 ER, 8 K");
    expect(formatLine(mp({}))).toBeNull();
  });
});
