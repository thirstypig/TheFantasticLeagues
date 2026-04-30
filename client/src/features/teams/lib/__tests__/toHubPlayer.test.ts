// client/src/features/teams/lib/__tests__/toHubPlayer.test.ts
//
// Unit tests for the RosterPlayer → RosterHubPlayer mapper. Covers the
// concrete regressions PRs #182, #183, and #184 introduced and fixed:
//
//   - #182 wired the v3 hub but used `rosterId` as the playerId stand-in.
//     Tests assert playerId is distinct and passes through.
//   - #183 threaded posList + gamesByPos through. Tests assert the
//     multi-position chip data lands in the right field, and that the
//     posPrimary fallback kicks in when posList is missing.
//   - #184 plumbed real Player.id. Tests cover the rosterId-vs-playerId
//     distinction explicitly so a future refactor can't reintroduce the
//     shortcut without breaking a test.
//
// All tests are pure — no rendering, no mocks. The mapper has no
// React/closure dependencies (deliberately; that's why it was
// extracted from the component).

import { describe, it, expect } from "vitest";
import { toHubPlayer, type RosterPlayerInput } from "../toHubPlayer";

/** Convenience builder so each test only specifies the fields it cares about. */
function makeInput(overrides: Partial<RosterPlayerInput> = {}): RosterPlayerInput {
  return {
    rosterId: 100,
    playerId: 500,
    playerName: "Mookie Betts",
    posPrimary: "OF",
    posList: "OF",
    assignedPosition: "OF",
    isPitcher: false,
    ...overrides,
  };
}

describe("toHubPlayer — identity fields", () => {
  it("plumbs the real Player.id (not rosterId) into the hub player", () => {
    // Regression guard for the PR #184 fix. rosterId mutates with every
    // claim/drop cycle; playerId is stable. If a future refactor reuses
    // rosterId as the playerId again, this test catches it.
    const result = toHubPlayer(makeInput({ rosterId: 100, playerId: 500 }));
    expect(result.rosterId).toBe(100);
    expect(result.playerId).toBe(500);
    expect(result.playerId).not.toBe(result.rosterId);
  });

  it("maps playerName → name", () => {
    const result = toHubPlayer(makeInput({ playerName: "Will Smith" }));
    expect(result.name).toBe("Will Smith");
  });
});

describe("toHubPlayer — multi-position eligibility (PR #183)", () => {
  it("passes posList through unchanged for multi-position players", () => {
    // Mookie Betts is OF,2B — needs the full string in posList so
    // PositionEligibilityCell renders both chips.
    const result = toHubPlayer(makeInput({ posList: "OF,2B", posPrimary: "OF" }));
    expect(result.posList).toBe("OF,2B");
  });

  it("falls back to posPrimary when posList is undefined", () => {
    // Server returns posList: null for filler/synthetic players. Without
    // the fallback the chip cell would render empty.
    const result = toHubPlayer(makeInput({ posList: undefined, posPrimary: "C" }));
    expect(result.posList).toBe("C");
  });

  it("falls back to posPrimary when posList is empty string", () => {
    // PR1 of plan #166 sometimes wrote "" for posList during failed
    // syncs — fallback must trigger on empty just like undefined.
    const result = toHubPlayer(makeInput({ posList: "", posPrimary: "1B" }));
    expect(result.posList).toBe("1B");
  });

  it("returns empty string only when both posList and posPrimary are absent", () => {
    // Genuinely-empty case — caller can detect this and render "—".
    const result = toHubPlayer(makeInput({ posList: undefined, posPrimary: undefined }));
    expect(result.posList).toBe("");
  });
});

describe("toHubPlayer — assignedSlot canonicalization", () => {
  it("uppercases the slot code", () => {
    const result = toHubPlayer(makeInput({ assignedPosition: "of" }));
    expect(result.assignedSlot).toBe("OF");
  });

  it("preserves IL as the structural slot", () => {
    // RosterHubV3 routes IL rows into the IL section based on this exact
    // string match.
    const result = toHubPlayer(makeInput({ assignedPosition: "IL" }));
    expect(result.assignedSlot).toBe("IL");
  });

  it("falls back to posPrimary when assignedPosition is missing", () => {
    const result = toHubPlayer(
      makeInput({ assignedPosition: undefined, posPrimary: "SS" }),
    );
    expect(result.assignedSlot).toBe("SS");
  });

  it("defaults to BN when both assignedPosition and posPrimary are absent", () => {
    // Worst-case (shouldn't happen with real data, but safe default).
    const result = toHubPlayer(
      makeInput({ assignedPosition: undefined, posPrimary: undefined }),
    );
    expect(result.assignedSlot).toBe("BN");
  });
});

describe("toHubPlayer — role-aware stats", () => {
  it("hitter rows get hitterStats and undefined pitcherStats", () => {
    const result = toHubPlayer(
      makeInput({
        isPitcher: false,
        R: 11, HR: 3, RBI: 15, SB: 0, AVG: ".270",
      }),
    );
    expect(result.hitterStats).toEqual({ R: 11, HR: 3, RBI: 15, SB: 0, AVG: ".270" });
    expect(result.pitcherStats).toBeUndefined();
  });

  it("pitcher rows get pitcherStats and undefined hitterStats", () => {
    const result = toHubPlayer(
      makeInput({
        isPitcher: true,
        W: 4, SV: 0, K: 34, ERA: 2.6, WHIP: 1.16,
      }),
    );
    expect(result.pitcherStats).toEqual({ W: 4, SV: 0, K: 34, ERA: 2.6, WHIP: 1.16 });
    expect(result.hitterStats).toBeUndefined();
  });

  it("hitter rows still return a hitterStats object even when stats are missing", () => {
    // Free-agent rows or pre-stat-sync rows have no stat fields. The
    // mapper still returns hitterStats with all-undefined values rather
    // than dropping the key — RosterRowV3 reads `player.hitterStats?.HR`
    // and renders "—" for undefined. If we returned undefined here the
    // optional-chain still works, but it forces a different branch in
    // the row component. Keeping the object simplifies that contract.
    const result = toHubPlayer(makeInput({ isPitcher: false }));
    expect(result.hitterStats).toBeDefined();
    expect(result.pitcherStats).toBeUndefined();
  });
});

describe("toHubPlayer — synthetic GP suffix data passthrough", () => {
  it("passes gamesByPos through to gamesPlayedByPosition", () => {
    // Today this comes from server's synthetic 60/40 distribution; when
    // Player.posGames lands the values become real per-position GP from
    // MLB Stats API. The wire shape doesn't change.
    const result = toHubPlayer(
      makeInput({ gamesByPos: { OF: 12, "2B": 8 } }),
    );
    expect(result.gamesPlayedByPosition).toEqual({ OF: 12, "2B": 8 });
  });

  it("leaves gamesPlayedByPosition undefined when gamesByPos is absent", () => {
    // PositionEligibilityCell renders chips without the "(N)" suffix
    // when this is undefined — graceful degradation.
    const result = toHubPlayer(makeInput({ gamesByPos: undefined }));
    expect(result.gamesPlayedByPosition).toBeUndefined();
  });
});

describe("toHubPlayer — passthrough metadata", () => {
  it("passes mlbTeam and isKeeper through", () => {
    const result = toHubPlayer(
      makeInput({ mlbTeam: "LAD", isKeeper: true }),
    );
    expect(result.mlbTeam).toBe("LAD");
    expect(result.isKeeper).toBe(true);
  });

  it("coerces a truthy isPitcher to boolean", () => {
    // Defensive: if someone passes a number (e.g. 1 from a CSV import),
    // the v3 row's React.memo comparison has to compare booleans for
    // referential stability. The double-bang normalizes.
    const result = toHubPlayer(
      makeInput({ isPitcher: 1 as unknown as boolean }),
    );
    expect(result.isPitcher).toBe(true);
    expect(typeof result.isPitcher).toBe("boolean");
  });
});
