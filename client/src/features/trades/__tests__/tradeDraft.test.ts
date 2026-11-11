import { describe, it, expect, beforeEach } from "vitest";
import { clearTradeDraft, loadTradeDraft, saveTradeDraft } from "../lib/tradeDraft";
import type { TradeDraft } from "../lib/tradeDraft";

const draft: TradeDraft = { leagueId: 20, partnerId: 2, give: [1, 2], get: [3], giveDollars: 5, getDollars: 0 };

beforeEach(() => localStorage.clear());

describe("tradeDraft", () => {
  it("round-trips under the versioned key", () => {
    saveTradeDraft(draft);
    expect(localStorage.getItem("fbst.tradeDraft.v1.20")).not.toBeNull();
    expect(loadTradeDraft(20)).toEqual(draft);
  });

  it("returns null when nothing is stored", () => {
    expect(loadTradeDraft(20)).toBeNull();
  });

  it("returns null for corrupt JSON", () => {
    localStorage.setItem("fbst.tradeDraft.v1.20", "{not json");
    expect(loadTradeDraft(20)).toBeNull();
  });

  it("returns null for a wrong shape", () => {
    localStorage.setItem("fbst.tradeDraft.v1.20", JSON.stringify({ leagueId: 20, give: "x" }));
    expect(loadTradeDraft(20)).toBeNull();
  });

  it("keeps leagues apart and clears one", () => {
    saveTradeDraft(draft);
    saveTradeDraft({ ...draft, leagueId: 21 });
    clearTradeDraft(20);
    expect(loadTradeDraft(20)).toBeNull();
    expect(loadTradeDraft(21)).not.toBeNull();
  });
});
