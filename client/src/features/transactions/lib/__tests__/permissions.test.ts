import { describe, it, expect } from "vitest";
import { canManageRoster } from "../permissions";

// Mirror of the server-side authorization matrix in
// server/src/middleware/auth.ts#requireTeamOwnerOrCommissioner. The UI
// gate MUST agree with the server — any divergence means users see
// affordances the server will reject (403) or miss affordances they could
// legitimately use. Each test names the row of the permission matrix
// from docs/plans/2026-04-23-roster-moves-unified-redesign-plan.md.

const BASE = {
  leagueId: 20,
  teamId: 147,
  myTeamId: 147,
  isLeagueMember: true,
  leagueRules: {} as Record<string, Record<string, string>>,
};

const notCommish = () => false;
const yesCommish = () => true;

describe("canManageRoster — matrix", () => {
  it("returns loading while leagueId/teamId/leagueRules are absent", () => {
    expect(canManageRoster({
      ...BASE, leagueId: null, isAdmin: false, isCommissioner: notCommish,
    })).toEqual({ kind: "loading" });

    expect(canManageRoster({
      ...BASE, teamId: null, isAdmin: false, isCommissioner: notCommish,
    })).toEqual({ kind: "loading" });

    expect(canManageRoster({
      ...BASE, leagueRules: null, isAdmin: false, isCommissioner: notCommish,
    })).toEqual({ kind: "loading" });
  });

  it("allows admin regardless of toggle / team / membership", () => {
    // Admin bypasses even the non-member branch — matches server admin short-circuit.
    expect(canManageRoster({
      ...BASE, isAdmin: true, isCommissioner: notCommish, isLeagueMember: false, myTeamId: null,
    })).toEqual({ kind: "allow" });
  });

  it("allows commissioner on any team in their league (toggle irrelevant)", () => {
    expect(canManageRoster({
      ...BASE, isAdmin: false, isCommissioner: yesCommish, myTeamId: 999, // not own team — still allowed
    })).toEqual({ kind: "allow" });
  });

  it("denies non-commissioner owner with toggle off — COMMISSIONER_ONLY", () => {
    const result = canManageRoster({
      ...BASE,
      isAdmin: false,
      isCommissioner: notCommish,
      leagueRules: { transactions: { owner_self_serve: "false" } },
    });
    expect(result).toEqual({ kind: "deny", reason: "COMMISSIONER_ONLY" });
  });

  it("denies non-commissioner with no transactions rule present — COMMISSIONER_ONLY (fail-closed)", () => {
    const result = canManageRoster({
      ...BASE,
      isAdmin: false,
      isCommissioner: notCommish,
      leagueRules: {}, // empty map — transactions.owner_self_serve absent
    });
    expect(result).toEqual({ kind: "deny", reason: "COMMISSIONER_ONLY" });
  });

  it("denies non-league-member with NOT_A_MEMBER (before checking toggle or ownership)", () => {
    const result = canManageRoster({
      ...BASE,
      isAdmin: false,
      isCommissioner: notCommish,
      isLeagueMember: false,
      leagueRules: { transactions: { owner_self_serve: "true" } }, // toggle true, but not even a member
    });
    expect(result).toEqual({ kind: "deny", reason: "NOT_A_MEMBER" });
  });

  it("denies owner of a DIFFERENT team with NOT_OWN_TEAM when toggle is on", () => {
    const result = canManageRoster({
      ...BASE,
      isAdmin: false,
      isCommissioner: notCommish,
      myTeamId: 200, // owns team 200; request targets team 147
      teamId: 147,
      leagueRules: { transactions: { owner_self_serve: "true" } },
    });
    expect(result).toEqual({ kind: "deny", reason: "NOT_OWN_TEAM" });
  });

  it("allows owner on their own team when toggle is on", () => {
    const result = canManageRoster({
      ...BASE,
      isAdmin: false,
      isCommissioner: notCommish,
      leagueRules: { transactions: { owner_self_serve: "true" } },
    });
    expect(result).toEqual({ kind: "allow" });
  });

  // Fail-closed matrix: the value must be exactly "true" to allow.
  // Mirrors the server-side fail-closed test set in
  // server/src/middleware/__tests__/authExtended.test.ts.
  describe("rule value fail-closed matrix", () => {
    const cases: Array<[string, string]> = [
      ["empty string", ""],
      ["capital False", "False"],
      ["capital TRUE", "TRUE"],
      ["numeric 1", "1"],
      ["whitespace-padded true", " true "],
    ];
    for (const [label, value] of cases) {
      it(`denies when rule value is ${label}`, () => {
        const result = canManageRoster({
          ...BASE,
          isAdmin: false,
          isCommissioner: notCommish,
          leagueRules: { transactions: { owner_self_serve: value } },
        });
        expect(result).toEqual({ kind: "deny", reason: "COMMISSIONER_ONLY" });
      });
    }
  });
});
