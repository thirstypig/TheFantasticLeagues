import { describe, it, expect } from "vitest";
import { checkTrade } from "../lib/tradeCheck";

const base = { cap: 23, myName: "Los Doyers", theirName: "Bombers" };

describe("checkTrade", () => {
  it("returns not ok with no lines when nothing is ticked", () => {
    expect(checkTrade({ ...base, mineActive: 23, theirsActive: 23, give: 0, get: 0 })).toEqual({ ok: false, lines: [] });
  });

  it("1-for-1 at the cap: both rosters stay at 23", () => {
    const r = checkTrade({ ...base, mineActive: 23, theirsActive: 23, give: 1, get: 1 });
    expect(r.ok).toBe(true);
    expect(r.lines).toEqual([{ tone: "good", text: "Both rosters stay at 23" }]);
  });

  it("1-for-1 below the cap says both stay at their count", () => {
    const r = checkTrade({ ...base, mineActive: 22, theirsActive: 22, give: 1, get: 1 });
    expect(r.lines).toEqual([{ tone: "good", text: "Both rosters stay at 22" }]);
  });

  it("1-for-1 with different counts says the same", () => {
    const r = checkTrade({ ...base, mineActive: 22, theirsActive: 23, give: 1, get: 1 });
    expect(r.ok).toBe(true);
    expect(r.lines).toEqual([{ tone: "good", text: "Both rosters stay the same" }]);
  });

  it("2-for-1 overflows the receiving team and notes the giver", () => {
    // I give 2, get 1: they go 23 -> 24 (over), I go 23 -> 22.
    const r = checkTrade({ ...base, mineActive: 23, theirsActive: 23, give: 2, get: 1 });
    expect(r.ok).toBe(false);
    expect(r.lines).toContainEqual({ tone: "bad", text: "Bombers would have 24 players (limit 23)" });
    expect(r.lines).toContainEqual({ tone: "note", text: "Los Doyers goes to 22 and fills the spot at the meeting" });
  });

  it("1-for-2 overflows me", () => {
    const r = checkTrade({ ...base, mineActive: 23, theirsActive: 23, give: 1, get: 2 });
    expect(r.ok).toBe(false);
    expect(r.lines).toContainEqual({ tone: "bad", text: "Los Doyers would have 24 players (limit 23)" });
    expect(r.lines).toContainEqual({ tone: "note", text: "Bombers goes to 22 and fills the spot at the meeting" });
  });

  it("a team going up but staying under the cap is fine", () => {
    const r = checkTrade({ ...base, mineActive: 21, theirsActive: 23, give: 1, get: 2 });
    expect(r.ok).toBe(true);
    expect(r.lines.some((l) => l.tone === "bad")).toBe(false);
  });

  it("a team already over the cap can still make an even trade", () => {
    const r = checkTrade({ ...base, mineActive: 24, theirsActive: 23, give: 1, get: 1 });
    expect(r.ok).toBe(true);
  });

  it("dollars alone make a valid trade side only when ticked players exist; players-only counts", () => {
    const r = checkTrade({ ...base, mineActive: 23, theirsActive: 23, give: 0, get: 1 });
    expect(r.ok).toBe(false); // me 24 > cap
  });
});
