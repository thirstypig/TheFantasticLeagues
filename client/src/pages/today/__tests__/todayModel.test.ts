import { describe, it, expect } from "vitest";
import {
  normalizeStandings,
  rankRows,
  summarizeRank,
  standingsPreview,
  periodHeader,
  orderTonight,
  formatLine,
  classifyNews,
  wireReminder,
  type PlayerNewsTx,
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

// ─── Player news ────────────────────────────────────────────────────────

// Tue 2026-04-28, local noon
const NEWS_NOW = new Date(2026, 3, 28, 12, 0, 0);

const ntx = (over: Partial<PlayerNewsTx>): PlayerNewsTx => ({
  id: 1,
  date: "2026-04-28",
  playerName: "Noah Schultz",
  mlbId: 100,
  typeCode: "SC",
  description: "Chicago White Sox activated LHP Noah Schultz from the 15-day injured list.",
  fromTeamAbbr: null,
  toTeamAbbr: "CWS",
  fromLeague: null,
  toLeague: "AL",
  ...over,
});

describe("classifyNews", () => {
  it("classifies IL placement with the injury", () => {
    const [n] = classifyNews(
      [ntx({
        playerName: "Juan Soto",
        description: "New York Mets placed LF Juan Soto on the 10-day injured list. Left hamstring strain.",
      })],
      NEWS_NOW,
    );
    expect(n).toMatchObject({
      key: "1",
      kind: "il-placed",
      title: "Soto placed on the 10-day IL",
      detail: "Left hamstring strain.",
      tone: "warn",
      leavesNl: false,
    });
  });

  it("classifies IL placement with retroactive wording and no injury", () => {
    const [n] = classifyNews(
      [ntx({ description: "Mets placed LF Juan Soto on the 15-day injured list retroactive to April 20." })],
      NEWS_NOW,
    );
    expect(n.kind).toBe("il-placed");
    expect(n.detail).toBe("");
  });

  it("returns empty IL detail when team name contains a period", () => {
    const [n] = classifyNews(
      [ntx({ description: "St. Louis Cardinals placed 1B Foo Bar on the 15-day injured list retroactive to April 20." })],
      NEWS_NOW,
    );
    expect(n.detail).toBe("");
  });

  it("extracts the injury for a Jr. player and for retroactive placements", () => {
    const out = classifyNews(
      [
        ntx({ id: 1, playerName: "Ronald Acuna Jr.", description: "Atlanta Braves placed RF Ronald Acuna Jr. on the 10-day injured list. Right knee sprain." }),
        ntx({ id: 2, description: "St. Louis Cardinals placed 1B Foo Bar on the 15-day injured list retroactive to April 20. Left oblique strain." }),
      ],
      NEWS_NOW,
    );
    expect(out[0].detail).toBe("Right knee sprain.");
    expect(out[1].detail).toBe("Left oblique strain.");
  });

  it("handles unknown trade teams without printing null", () => {
    const out = classifyNews(
      [
        ntx({ id: 1, typeCode: "TR", description: "Traded.", fromTeamAbbr: "ARI", toTeamAbbr: null, fromLeague: "NL", toLeague: null }),
        ntx({ id: 2, typeCode: "TR", description: "Traded.", fromTeamAbbr: null, toTeamAbbr: "SEA", fromLeague: null, toLeague: "AL" }),
        ntx({ id: 3, typeCode: "TR", description: "Traded.", fromTeamAbbr: null, toTeamAbbr: null, fromLeague: null, toLeague: null }),
      ],
      NEWS_NOW,
    );
    expect(out[0]).toMatchObject({ title: "Schultz traded", detail: "From ARI" });
    expect(out[1]).toMatchObject({ title: "Schultz traded to SEA", detail: "To SEA" });
    expect(out[2]).toMatchObject({ title: "Schultz traded", detail: "" });
  });

  it("keeps name suffixes in titles", () => {
    const out = classifyNews(
      [
        ntx({ id: 1, playerName: "Fernando Tatis Jr.", description: "San Diego Padres placed RF Fernando Tatis Jr. on the 10-day injured list. Back spasms." }),
        ntx({ id: 2, playerName: "Vladimir Guerrero Jr.", typeCode: "TR", description: "Traded.", fromTeamAbbr: "NYM", toTeamAbbr: "SEA", fromLeague: "NL", toLeague: "AL" }),
        ntx({ id: 3, playerName: "Ken Griffey III", typeCode: "REL", description: "Released." }),
        ntx({ id: 4, playerName: "Foo Bar Sr", typeCode: "REL", description: "Released." }),
      ],
      NEWS_NOW,
    );
    expect(out.map((n) => n.title)).toEqual([
      "Tatis Jr. placed on the 10-day IL",
      "Guerrero Jr. traded to SEA",
      "Griffey III released",
      "Bar Sr released",
    ]);
  });

  it("classifies IL activation", () => {
    const [n] = classifyNews([ntx({})], NEWS_NOW);
    expect(n).toMatchObject({
      kind: "il-activated",
      title: "Schultz activated from the IL",
      detail: "Back on the active roster",
      tone: "good",
    });
  });

  it("drops reserve-list status changes", () => {
    const out = classifyNews(
      [
        ntx({ id: 1, description: "Chicago White Sox placed LHP Noah Schultz on the paternity list." }),
        ntx({ id: 2, description: "Chicago White Sox placed LHP Noah Schultz on the restricted list." }),
      ],
      NEWS_NOW,
    );
    expect(out).toEqual([]);
  });

  it("classifies optioned and outrighted as sent down", () => {
    const out = classifyNews(
      [
        ntx({ id: 1, typeCode: "OPT", description: "Optioned LHP Noah Schultz to Charlotte." }),
        ntx({ id: 2, typeCode: "OUT", description: "Outrighted LHP Noah Schultz to Charlotte." }),
      ],
      NEWS_NOW,
    );
    expect(out.map((n) => n.kind)).toEqual(["sent-down", "sent-down"]);
    expect(out[0]).toMatchObject({
      title: "Schultz sent down to the minors",
      detail: "Optioned LHP Noah Schultz to Charlotte.",
      tone: "neutral",
    });
  });

  it("classifies recalled and selected as called up", () => {
    const out = classifyNews(
      [
        ntx({ id: 1, typeCode: "CU", description: "Recalled." }),
        ntx({ id: 2, typeCode: "SE", description: "Selected." }),
      ],
      NEWS_NOW,
    );
    expect(out.map((n) => n.kind)).toEqual(["called-up", "called-up"]);
    expect(out[0]).toMatchObject({ title: "Schultz called up", detail: "Recalled.", tone: "good" });
  });

  it("tags only NL-to-AL trades as leaving the NL", () => {
    const out = classifyNews(
      [
        ntx({ id: 1, typeCode: "TR", description: "Traded.", fromTeamAbbr: "NYM", toTeamAbbr: "CWS", fromLeague: "NL", toLeague: "AL" }),
        ntx({ id: 2, typeCode: "TR", description: "Traded.", fromTeamAbbr: "NYM", toTeamAbbr: "LAD", fromLeague: "NL", toLeague: "NL" }),
        ntx({ id: 3, typeCode: "TR", description: "Traded.", fromTeamAbbr: "CWS", toTeamAbbr: "NYM", fromLeague: "AL", toLeague: "NL" }),
      ],
      NEWS_NOW,
    );
    expect(out.map((n) => n.leavesNl)).toEqual([true, false, false]);
    expect(out.map((n) => n.tone)).toEqual(["warn", "neutral", "neutral"]);
    expect(out[0]).toMatchObject({ kind: "traded", title: "Schultz traded to CWS", detail: "From NYM to CWS" });
  });

  it("classifies DFA and release as warnings", () => {
    const out = classifyNews(
      [
        ntx({ id: 1, typeCode: "DES", description: "Designated for assignment." }),
        ntx({ id: 2, typeCode: "REL", description: "Released." }),
      ],
      NEWS_NOW,
    );
    expect(out[0]).toMatchObject({ kind: "dfa", title: "Schultz designated for assignment", tone: "warn" });
    expect(out[1]).toMatchObject({ kind: "released", title: "Schultz released", tone: "warn" });
  });

  it("labels when as Today, Yesterday or weekday", () => {
    const out = classifyNews(
      [
        ntx({ id: 1, date: "2026-04-28" }),
        ntx({ id: 2, date: "2026-04-27" }),
        ntx({ id: 3, date: "2026-04-23" }),
      ],
      NEWS_NOW,
    );
    expect(out.map((n) => n.when)).toEqual(["Today", "Yesterday", "Thu"]);
  });

  it("caps news at 8 items", () => {
    const many = Array.from({ length: 12 }, (_, i) => ntx({ id: i + 1 }));
    const out = classifyNews(many, NEWS_NOW);
    expect(out).toHaveLength(8);
    expect(out.map((n) => n.key)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });
});

describe("wireReminder", () => {
  const wp = (over: Record<string, unknown>) =>
    ({ id: 5, status: "PENDING", deadlineAt: new Date(2026, 5, 21, 23, 0, 0).toISOString(), leagueId: 20, ...over }) as any;

  it("wire reminder appears within 48 hours of a pending deadline", () => {
    expect(wireReminder(wp({}), new Date(2026, 5, 20, 12, 0, 0))).toEqual({
      text: "Wire List locks Sun 11:00 PM",
    });
  });

  it("wire reminder hidden when locked, past, or more than 48 hours out", () => {
    const now = new Date(2026, 5, 20, 12, 0, 0);
    expect(wireReminder(null, now)).toBeNull();
    expect(wireReminder(wp({ status: "LOCKED" }), now)).toBeNull();
    expect(wireReminder(wp({}), new Date(2026, 5, 22, 0, 0, 0))).toBeNull();
    expect(wireReminder(wp({}), new Date(2026, 5, 19, 12, 0, 0))).toBeNull();
  });
});
