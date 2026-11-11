import { describe, it, expect } from "vitest";
import { describeChange } from "../lib/recentChangeCopy";
import { historyChipFor, matchesChip } from "../lib/historyFilters";
import type { RecentChange } from "../api";

const c = (action: string, metadata: Record<string, unknown> | null = null, resourceId: string | null = null): RecentChange => ({
  id: 1, action, resourceType: "X", resourceId, createdAt: "2026-06-14T20:31:00.000Z", userName: "Jim", metadata,
});

describe("describeChange: commissioner-management actions", () => {
  it("RULES_UPDATE with key and value", () => {
    expect(describeChange(c("RULES_UPDATE", { leagueId: 20, category: "trades", key: "trade_window", value: "meeting_day" }), []))
      .toBe("Changed a league rule: Trade window → meeting day");
  });
  it("RULES_UPDATE without key (bulk PUT logs only updateCount)", () => {
    expect(describeChange(c("RULES_UPDATE", { updateCount: 3 }), [])).toBe("Changed a league rule");
    expect(describeChange(c("RULES_UPDATE"), [])).toBe("Changed a league rule");
  });
  it("members", () => {
    expect(describeChange(c("MEMBER_ADD"), [])).toBe("Added a member");
    expect(describeChange(c("MEMBER_REMOVE"), [])).toBe("Removed a member");
  });
  it("invites", () => {
    expect(describeChange(c("INVITE_CANCEL", { email: "a@b.com" }), [])).toBe("Canceled the invite for a@b.com");
    expect(describeChange(c("INVITE_CANCEL"), [])).toBe("Canceled an invite");
    expect(describeChange(c("INVITE_CODE_REGENERATE"), [])).toBe("Made a new invite code");
  });
  it("team owners", () => {
    expect(describeChange(c("TEAM_OWNER_ADD", { ownerName: "Sam" }), [])).toBe("Added Sam as a team owner");
    expect(describeChange(c("TEAM_OWNER_ADD"), [])).toBe("Added a team owner");
    expect(describeChange(c("TEAM_OWNER_REMOVE"), [])).toBe("Removed a team owner");
  });
});

describe("history chips", () => {
  const chip = historyChipFor;
  it("maps actions to chips", () => {
    expect(chip("PERIOD_CLOSE")).toBe("Periods");
    expect(chip("IL_FEE_RECONCILE")).toBe("Money");
    expect(chip("FINANCE_ADJUST")).toBe("Money");
    expect(chip("LATE_FEE_WAIVED")).toBe("Money");
    expect(chip("BILL_PERIOD")).toBe("Money");
    expect(chip("RULES_UPDATE")).toBe("Rules");
    expect(chip("LEAGUE_UPDATE")).toBe("Rules");
    expect(chip("TRADE_PROCESS")).toBe("Trades");
    expect(chip("ROSTER_MOVE")).toBe("Rosters");
    expect(chip("COMMISSIONER_ASSIGN_PLAYER")).toBe("Rosters");
    expect(chip("COMMISSIONER_RELEASE_PLAYER")).toBe("Rosters");
    expect(chip("WIRE_LIST_ADD")).toBe("Rosters");
    expect(chip("MEMBER_ADD")).toBe("Owners");
    expect(chip("INVITE_CANCEL")).toBe("Owners");
    expect(chip("TEAM_OWNER_ADD")).toBe("Owners");
    expect(chip("TEAM_RENAME")).toBe("Owners");
    expect(chip("SOMETHING_ELSE")).toBeNull();
  });
  it("All matches everything; a chip matches only its own", () => {
    expect(matchesChip("SOMETHING_ELSE", "All")).toBe(true);
    expect(matchesChip("SOMETHING_ELSE", "Money")).toBe(false);
    expect(matchesChip("TRADE_PROCESS", "Trades")).toBe(true);
    expect(matchesChip("TRADE_PROCESS", "Rules")).toBe(false);
  });
});
