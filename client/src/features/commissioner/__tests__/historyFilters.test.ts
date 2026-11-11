import { describe, it, expect } from "vitest";
import { historyChipFor, matchesChip } from "../lib/historyFilters";

describe("historyChipFor", () => {
  it.each([
    "TRANSACTION_CLAIM", "TRANSACTION_DROP", "TRANSACTION_IL_STASH", "TRANSACTION_IL_ACTIVATE",
    "COMMISSIONER_FORCE_DROP", "COMMISSIONER_BULK_IL_STASH", "COMMISSIONER_CLEANUP_DROPPED_ROSTER",
    "ROSTER_ADD", "WIRE_LIST_ADD_SUCCEED",
  ])("%s -> Rosters", (a) => expect(historyChipFor(a)).toBe("Rosters"));

  it("COMMISSIONER_TRADE_EXECUTE -> Trades", () => expect(historyChipFor("COMMISSIONER_TRADE_EXECUTE")).toBe("Trades"));
  it("keeps existing groups", () => {
    expect(historyChipFor("IL_FEE_RECONCILE")).toBe("Money");
    expect(historyChipFor("PERIOD_CLOSE")).toBe("Periods");
    expect(historyChipFor("TEAM_OWNER_ADD")).toBe("Owners");
  });
  it("unknown actions only appear under All", () => {
    expect(historyChipFor("LOGIN")).toBeNull();
    expect(matchesChip("LOGIN", "All")).toBe(true);
    expect(matchesChip("LOGIN", "Rosters")).toBe(false);
  });
});
