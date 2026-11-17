import { describe, it, expect, vi } from "vitest";

vi.mock("../../db/prisma.js", () => ({ prisma: {} }));

import { resolveCategories, getLeagueCategories } from "../leagueCategories.js";
import { invalidateLeagueRules } from "../leagueRuleCache.js";
import { CATEGORY_CONFIG } from "../sports/baseball.js";

const OGBA_H = '["R","HR","RBI","SB","AVG"]', OGBA_P = '["W","S","ERA","WHIP","K"]';
const keys = (r: { categories: { key: string }[] }) => r.categories.map((c) => c.key);

describe("resolveCategories", () => {
  it("OGBA's stored lists resolve to the 10 in canonical order", () => {
    const r = resolveCategories(OGBA_H, OGBA_P);
    expect(keys(r)).toEqual(["R","HR","RBI","SB","AVG","W","SV","ERA","WHIP","K"]);
    expect(r.dropped).toEqual([]); expect(r.fellBack).toEqual([]);
  });
  it("the categories are the same objects' values as CATEGORY_CONFIG", () => {
    expect(resolveCategories(OGBA_H, OGBA_P).categories.map(({ key, label, lowerIsBetter }) => ({ key, label, lowerIsBetter })))
      .toEqual(CATEGORY_CONFIG.map(({ key, label, lowerIsBetter }) => ({ key, label, lowerIsBetter })));
  });
  it("normalizes case, whitespace, S alias and duplicates", () => {
    expect(keys(resolveCategories('[" hr ","r","R"]', '["sv","S"," k"]'))).toEqual(["R","HR","SV","K"]);
  });
  it("drops unscorable keys and reports them", () => {
    const r = resolveCategories('["R","OPS"]', '["W","QS"]');
    expect(keys(r)).toEqual(["R","W"]); expect(r.dropped).toEqual(["OPS","QS"]);
  });
  it("a half with nothing scorable falls back to its standard 5", () => {
    const r = resolveCategories('["R","HR"]', '["QS","HLD"]');
    expect(keys(r)).toEqual(["R","HR","W","SV","ERA","WHIP","K"]); expect(r.fellBack).toEqual(["P"]);
  });
  it("missing or unparseable halves fall back", () => {
    expect(resolveCategories(null, '["K"]').fellBack).toEqual(["H"]);
    expect(keys(resolveCategories("not json", '["K"]'))).toEqual(["R","HR","RBI","SB","AVG","K"]);
    expect(resolveCategories('{"a":1}', '["K"]').fellBack).toEqual(["H"]);
  });
  it("an explicit [] scores none of that half", () => {
    const r = resolveCategories('["R","AVG"]', "[]");
    expect(keys(r)).toEqual(["R","AVG"]); expect(r.fellBack).toEqual([]);
  });
  it("both halves [] fall back to all 10", () => {
    const r = resolveCategories("[]", "[]");
    expect(r.categories).toHaveLength(10); expect(r.fellBack).toEqual(["ALL"]);
  });
});

describe("getLeagueCategories", () => {
  it("a league with no rule rows scores the 10", async () => {
    const client = { leagueRule: { findMany: vi.fn().mockResolvedValue([]) } };
    invalidateLeagueRules(999);
    expect(await getLeagueCategories(999, client as any)).toHaveLength(10);
    expect(client.leagueRule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { leagueId: 999 } }));
  });
  it("reads scoring.hitting_stats / pitching_stats for that league", async () => {
    const client = { leagueRule: { findMany: vi.fn().mockResolvedValue([
      { category: "scoring", key: "hitting_stats", value: '["HR"]' },
      { category: "scoring", key: "pitching_stats", value: "[]" },
      { category: "overview", key: "hitting_stats", value: '["R"]' },
    ]) } };
    invalidateLeagueRules(998);
    expect((await getLeagueCategories(998, client as any)).map((c) => c.key)).toEqual(["HR"]);
  });
});
