import { describe, it, expect } from "vitest";
import type { ClientAuctionState, AuctionTeam, AuctionLogEvent, AuctionRosterEntry } from "../../hooks/useAuctionState";
import {
  teamNeeds, boardGroups, lotBids, lastSales, orderStrip, bidValidation, playersLeft,
} from "../auctionSelectors";

// Shapes copied from the real server: loadPositionLimits() returns the league's
// `roster.roster_positions` rule (baseball.ts seed) — note the corner slot is
// "CM" and there is NO "P" key; pitcher count comes from config.pitcherCount.
const OGBA_LIMITS = { C: 2, "1B": 1, "2B": 1, "3B": 1, SS: 1, MI: 1, CM: 1, OF: 5, DH: 1 };
const config: ClientAuctionState["config"] = {
  bidTimer: 15, nominationTimer: 30, budgetCap: 400, rosterSize: 23,
  pitcherCount: 9, batterCount: 14, positionLimits: OGBA_LIMITS,
};

let nextId = 1;
// Mirrors refreshTeams: auction wins carry assignedPosition = player's primary MLB position.
function rp(name: string, posPrimary: string, price: number, assignedPosition: string | null = posPrimary): AuctionRosterEntry {
  const id = nextId++;
  return { id, playerId: id, mlbId: 1000 + id, playerName: name, price, assignedPosition, source: "auction_2026", posPrimary, posList: posPrimary, mlbTeam: "LAD" };
}
function team(id: number, name: string, roster: AuctionRosterEntry[], over: Partial<AuctionTeam> = {}): AuctionTeam {
  const rosterSize = 23;
  const spent = roster.reduce((s, r) => s + r.price, 0);
  const spotsLeft = rosterSize - roster.length;
  return {
    id, name, code: name.slice(0, 3).toUpperCase(), budget: 400 - spent, maxBid: 400 - spent - Math.max(0, spotsLeft - 1),
    rosterCount: roster.length, spotsLeft, roster, ...over,
  };
}
function state(over: Partial<ClientAuctionState> = {}): ClientAuctionState {
  return {
    leagueId: 20, status: "bidding", nomination: null, teams: [], queue: [], queueIndex: 0,
    nominationEndTime: null, paused: false, config, log: [], lastUpdate: 0, ...over,
  };
}
const nom = (over = {}) => ({
  playerId: "660271", playerName: "Shohei Ohtani", playerTeam: "LAD", positions: "DH", isPitcher: false,
  nominatorTeamId: 1, currentBid: 10, highBidderTeamId: 2, endTime: "2026-03-01T00:00:00Z", timerDuration: 15,
  status: "running" as const, ...over,
});

describe("teamNeeds", () => {
  it("lists every open slot for an empty roster, with x-counts above one", () => {
    expect(teamNeeds(team(1, "Empty", []), config)).toBe("C ×2, 1B, 2B, 3B, SS, MI, CM, OF ×5, DH, P ×9");
  });

  it("drops filled slots and decrements counts", () => {
    const t = team(1, "Mixed", [
      rp("Will Smith", "C", 10), rp("Freddie Freeman", "1B", 30), rp("Mookie Betts", "SS", 25),
      rp("Teoscar", "LF", 12), rp("Kike", "CF", 8),
      rp("Yamamoto", "SP", 20, "SP"), rp("Clase", "RP", 5, null),
    ]);
    expect(teamNeeds(t, config)).toBe("C, 2B, 3B, MI, CM, OF ×3, DH, P ×7");
  });

  it("spills a second shortstop into MI, a second first baseman into CM, then DH", () => {
    const t = team(1, "Spill", [
      rp("A", "SS", 1), rp("B", "SS", 1), rp("C1", "1B", 1), rp("D", "1B", 1), rp("E", "1B", 1),
    ]);
    // SS, MI, 1B, CM full; third 1B lands on DH
    expect(teamNeeds(t, config)).toBe("C ×2, 2B, 3B, OF ×5, P ×9");
  });

  it("falls back to assignedPosition when posPrimary is absent", () => {
    const e = rp("X", "C", 1); delete e.posPrimary;
    expect(teamNeeds(team(1, "T", [e]), config)).toMatch(/^C, 1B/);
  });

  it("returns an empty string when the roster is full", () => {
    const hitters = [
      "C", "C", "1B", "2B", "3B", "SS", "SS", "1B", "OF", "OF", "OF", "OF", "OF", "DH",
    ].map((p, i) => rp(`H${i}`, p, 1));
    const pitchers = Array.from({ length: 9 }, (_, i) => rp(`P${i}`, "SP", 1));
    expect(teamNeeds(team(1, "Full", [...hitters, ...pitchers]), config)).toBe("");
  });

  it("handles a league without per-slot limits (null) as hitters + pitchers", () => {
    const cfg = { ...config, positionLimits: null };
    expect(teamNeeds(team(1, "T", [rp("A", "C", 1), rp("B", "SP", 1)]), cfg)).toBe("H ×13, P ×8");
  });

  it("lists raw slots for keys outside the known groups and uses limits.P when present", () => {
    const cfg = { ...config, positionLimits: { C: 1, UT: 2, P: 3 } };
    expect(teamNeeds(team(1, "T", []), cfg)).toBe("C, UT ×2, P ×3");
  });
});

describe("boardGroups", () => {
  const t = team(1, "Mixed", [
    rp("Will Smith", "C", 10), rp("Freddie Freeman", "1B", 30), rp("Mookie Betts", "SS", 25),
    rp("Teoscar", "LF", 12), rp("Yamamoto", "SP", 20), rp("Kike", "2B", 7), rp("Max Muncy", "3B", 9),
  ]);

  it("returns the five Style Bible groups plus DH for the OGBA limits", () => {
    const g = boardGroups(t, config);
    expect(g.map(x => x.label)).toEqual(["C ×2", "1B · 2B · 3B", "SS · MI · CM", "OF ×5", "DH", "P ×9"]);
  });

  it("puts each player in the group of the slot they fill, with name and price", () => {
    const g = boardGroups(t, config);
    const by = (l: string) => g.find(x => x.label === l)!;
    expect(by("C ×2").filled).toEqual([{ name: "Will Smith", price: 10, mlbId: expect.any(Number) }]);
    expect(by("C ×2").open).toBe(1);
    expect(by("1B · 2B · 3B").filled.map(f => f.name)).toEqual(["Freddie Freeman", "Kike", "Max Muncy"]);
    expect(by("1B · 2B · 3B").open).toBe(0);
    expect(by("SS · MI · CM").filled.map(f => f.name)).toEqual(["Mookie Betts"]);
    expect(by("SS · MI · CM").open).toBe(2);
    expect(by("OF ×5").open).toBe(4);
    expect(by("P ×9").filled.map(f => f.name)).toEqual(["Yamamoto"]);
    expect(by("P ×9").open).toBe(8);
  });

  it("every rostered player appears exactly once when the roster fits", () => {
    const total = boardGroups(t, config).reduce((n, x) => n + x.filled.length, 0);
    expect(total).toBe(t.roster.length);
  });

  it("falls back to raw slot groups for limits that do not map", () => {
    const g = boardGroups(team(1, "T", [rp("A", "C", 1)]), { ...config, positionLimits: { C: 1, UT: 2 } });
    expect(g.map(x => x.label)).toEqual(["C", "UT ×2", "P ×9"]);
    expect(g[0].filled).toHaveLength(1);
  });
});

describe("lotBids", () => {
  const log: AuctionLogEvent[] = [ // newest first, as the server unshifts
    { type: "BID", teamId: 3, teamName: "C", amount: 12, timestamp: 5, message: "C auto-bid $12" },
    { type: "BID", teamId: 2, teamName: "B", amount: 11, timestamp: 4, message: "B bid $11" },
    { type: "NOMINATION", teamId: 1, teamName: "A", amount: 10, timestamp: 3, message: "A nominated X for $10" },
    { type: "BID", teamId: 9, teamName: "Z", amount: 99, timestamp: 2, message: "Z bid $99" },
    { type: "WIN", teamId: 9, teamName: "Z", amount: 99, timestamp: 1, message: "won" },
  ];
  it("returns BID entries after the latest nomination, newest first, flagging auto bids", () => {
    expect(lotBids(state({ log }))).toEqual([
      { teamId: 3, teamName: "C", amount: 12, timestamp: 5, auto: true },
      { teamId: 2, teamName: "B", amount: 11, timestamp: 4, auto: false },
    ]);
  });
  it("is empty when nobody has bid yet or the log is empty", () => {
    expect(lotBids(state({ log: [log[2]] }))).toEqual([]);
    expect(lotBids(state({ log: [] }))).toEqual([]);
  });
});

describe("lastSales", () => {
  const wins: AuctionLogEvent[] = Array.from({ length: 7 }, (_, i) => ({
    type: "WIN" as const, teamId: i, teamName: `T${i}`, playerName: `P${i}`, amount: i + 1, timestamp: 100 - i, message: "m",
  }));
  it("returns the 5 newest WIN entries, skipping other types", () => {
    const log: AuctionLogEvent[] = [wins[0], { type: "BID", amount: 3, timestamp: 99, message: "b" }, ...wins.slice(1)];
    const res = lastSales(state({ log }));
    expect(res.map(r => r.playerName)).toEqual(["P0", "P1", "P2", "P3", "P4"]);
    expect(res[0]).toEqual({ playerName: "P0", teamId: 0, teamName: "T0", amount: 1, timestamp: 100 });
  });
  it("honours a custom limit", () => {
    expect(lastSales(state({ log: wins }), 2)).toHaveLength(2);
  });
  it("leaves out sales that were undone and carries the playerId", () => {
    const log: AuctionLogEvent[] = [
      { ...wins[0], undone: true },
      { ...wins[1], playerId: "547180", rosterId: 9, saleKind: "lot" },
      wins[2],
    ];
    const res = lastSales(state({ log }));
    expect(res.map(r => r.playerName)).toEqual(["P1", "P2"]);
    expect(res[0].playerId).toBe("547180");
  });
});

describe("orderStrip", () => {
  const spots = (n: number) => Array.from({ length: 23 - n }, (_, i) => rp(`p${i}`, "OF", 1)); // roster so spotsLeft = n
  const teams = [
    team(1, "One", spots(5)), team(2, "Two", spots(5)), team(3, "Three", spots(0)),
    team(4, "Four", spots(5)), team(5, "Five", spots(5)),
  ];
  it("gives now, next and the rest in turn order, skipping full teams", () => {
    const s = state({ teams, queue: [1, 2, 3, 4, 5], queueIndex: 1 });
    const o = orderStrip(s, 4);
    expect(o.now?.team.id).toBe(2);
    expect(o.next?.team.id).toBe(4); // team 3 is full, skipped like advanceQueue
    expect(o.rest.map(r => r.team.id)).toEqual([5, 1]);
    expect(o.rest.map(r => r.isMe)).toEqual([false, false]);
    expect(o.next?.isMe).toBe(true);
    expect(o.now?.isMe).toBe(false);
  });
  it("wraps around the end of the queue", () => {
    const o = orderStrip(state({ teams, queue: [1, 2, 3, 4, 5], queueIndex: 4 }), null);
    expect(o.now?.team.id).toBe(5);
    expect(o.next?.team.id).toBe(1);
    expect(o.rest.map(r => r.team.id)).toEqual([2, 4]);
  });
  it("has no next when the team on the clock is the only one with spots", () => {
    const only = [team(1, "One", spots(2)), team(2, "Two", spots(0))];
    const o = orderStrip(state({ teams: only, queue: [1, 2], queueIndex: 0 }), 1);
    expect(o.now?.team.id).toBe(1);
    expect(o.next).toBeNull();
    expect(o.rest).toEqual([]);
  });
  it("returns an empty strip with no queue", () => {
    expect(orderStrip(state(), 1)).toEqual({ now: null, next: null, rest: [] });
  });
});

describe("bidValidation", () => {
  const me = team(2, "Two", [], { maxBid: 60 });
  const s = state({ teams: [me], nomination: nom({ currentBid: 10 }) });
  it("accepts a whole number above the current bid up to max bid", () => {
    expect(bidValidation(11, s, me)).toEqual({ ok: true });
    expect(bidValidation(60, s, me)).toEqual({ ok: true });
    expect(bidValidation("25", s, me)).toEqual({ ok: true });
  });
  it("rejects non-whole, empty and non-numeric input", () => {
    for (const bad of [10.5, NaN, "", "  ", "abc", "12.5", Infinity]) {
      const r = bidValidation(bad as number | string, s, me);
      expect(r.ok).toBe(false);
    }
    expect(bidValidation(10.5, s, me)).toEqual({ ok: false, message: "Enter a whole number" });
  });
  it("rejects amounts at or below the current bid", () => {
    expect(bidValidation(10, s, me)).toEqual({ ok: false, message: "Bid must be more than $10" });
    expect(bidValidation(3, s, me)).toEqual({ ok: false, message: "Bid must be more than $10" });
  });
  it("rejects amounts above max bid", () => {
    expect(bidValidation(61, s, me)).toEqual({ ok: false, message: "Your max bid is $60" });
  });
  it("rejects when no player is up or you have no team", () => {
    expect(bidValidation(5, state(), me)).toEqual({ ok: false, message: "No player is up for bid" });
    expect(bidValidation(20, s, null)).toEqual({ ok: false, message: "You don't have a team in this league" });
  });
});

describe("playersLeft", () => {
  it("sums open roster spots across teams", () => {
    const t1 = team(1, "A", [rp("x", "C", 1)]);   // 22
    const t2 = team(2, "B", []);                  // 23
    expect(playersLeft(state({ teams: [t1, t2] }))).toBe(45);
  });
});
