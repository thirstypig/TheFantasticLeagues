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
        AB: 40, H: 11, R: 11, HR: 3, RBI: 15, SB: 0, AVG: ".275",
      }),
    );
    // Session 89 added AB and H (so users can verify AVG = H/AB
    // inline). The mapper passes them through unchanged.
    expect(result.hitterStats).toEqual({
      AB: 40, H: 11, R: 11, HR: 3, RBI: 15, SB: 0, AVG: ".275",
    });
    expect(result.pitcherStats).toBeUndefined();
  });

  it("pitcher rows get pitcherStats and undefined hitterStats", () => {
    const result = toHubPlayer(
      makeInput({
        isPitcher: true,
        IP: 22.1, BB_H: 25, K: 34, W: 4, SV: 0, ER: 6, ERA: 2.6, WHIP: 1.12,
      }),
    );
    // Session 89 added IP, BB_H (combined hits + walks allowed —
    // matches the WHIP numerator the wire format already carries) and
    // ER (the ERA numerator) so users can verify the rate stats.
    expect(result.pitcherStats).toEqual({
      IP: 22.1, BB_H: 25, K: 34, W: 4, SV: 0, ER: 6, ERA: 2.6, WHIP: 1.12,
    });
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

  it("drops unknown slot keys from gamesByPos", () => {
    // Per todo #132 — narrowGamesByPos uses isSlotCode to filter rather
    // than casting the whole record through. Ensures the runtime shape
    // matches the declared `Partial<Record<SlotCode, number>>` type.
    const result = toHubPlayer(
      makeInput({
        gamesByPos: {
          OF: 12,
          UTIL: 5, // unknown slot — should be dropped
          XYZ: 7,  // unknown slot — should be dropped
          "2B": 8,
        },
      }),
    );
    expect(result.gamesPlayedByPosition).toEqual({ OF: 12, "2B": 8 });
  });
});

describe("toHubPlayer — unknown slot input fallback (todo #132)", () => {
  it("falls back to BN when assignedPosition is an unknown string", () => {
    // Per todo #132 — replaces an `as any` cast that would have laundered
    // arbitrary strings into the SlotCode union. SlotCodeSchema.safeParse
    // narrows the input; misses fall back to "BN" (always available).
    const result = toHubPlayer(
      makeInput({ assignedPosition: "UTIL", posPrimary: undefined }),
    );
    expect(result.assignedSlot).toBe("BN");
  });

  it("falls back to BN when posPrimary is unknown and assignedPosition missing", () => {
    const result = toHubPlayer(
      makeInput({ assignedPosition: undefined, posPrimary: "UTIL" }),
    );
    expect(result.assignedSlot).toBe("BN");
  });

  it("preserves all wire SlotCodes — BN, SP, RP pass through", () => {
    // The wire SlotCode union includes pitcher sub-codes; the mapper must
    // not coerce them to "P" (display layer handles that if needed).
    expect(toHubPlayer(makeInput({ assignedPosition: "BN" })).assignedSlot).toBe("BN");
    expect(toHubPlayer(makeInput({ assignedPosition: "SP" })).assignedSlot).toBe("SP");
    expect(toHubPlayer(makeInput({ assignedPosition: "RP" })).assignedSlot).toBe("RP");
  });

  it("an empty-string assignedPosition + posPrimary still defaults to BN", () => {
    const result = toHubPlayer(
      makeInput({ assignedPosition: "", posPrimary: "" }),
    );
    expect(result.assignedSlot).toBe("BN");
  });
});

describe("toHubPlayer — discriminated union narrowing (todo #153)", () => {
  it("hitter result narrows to hitterStats branch via the isPitcher discriminant", () => {
    // Per todo #153 — `RosterHubPlayer` is a discriminated union on
    // `isPitcher`. Inside the false branch only `hitterStats` is in scope
    // (TypeScript flags `.pitcherStats` access at compile time). This
    // test pins the runtime contract.
    const result = toHubPlayer(makeInput({ isPitcher: false, R: 5 }));
    if (result.isPitcher) {
      throw new Error("expected hitter row, got pitcher");
    }
    // Inside this branch, `result.hitterStats` is statically known.
    expect(result.hitterStats?.R).toBe(5);
    // @ts-expect-error pitcherStats does not exist on the hitter branch
    expect(result.pitcherStats).toBeUndefined();
  });

  it("pitcher result narrows to pitcherStats branch via the isPitcher discriminant", () => {
    const result = toHubPlayer(makeInput({ isPitcher: true, W: 7 }));
    if (!result.isPitcher) {
      throw new Error("expected pitcher row, got hitter");
    }
    expect(result.pitcherStats?.W).toBe(7);
    // @ts-expect-error hitterStats does not exist on the pitcher branch
    expect(result.hitterStats).toBeUndefined();
  });
});

describe("toHubPlayer — mlbStatus passthrough (ghost-IL chip wake-up)", () => {
  // The whole point of feat/player-mlbstatus-plumbing — Cluster K wired
  // the chip against `RosterHubPlayer.mlbStatus` but the mapper input
  // was always `mlbStatus: undefined` because the server didn't ship it.
  // With the wire field plumbed, the mapper must pass it through verbatim.

  it("passes Injured-Day status verbatim — drives ghost-IL chip", () => {
    const result = toHubPlayer(makeInput({ mlbStatus: "Injured 10-Day" }));
    expect(result.mlbStatus).toBe("Injured 10-Day");
  });

  it("passes Active status through (no chip should render for these)", () => {
    const result = toHubPlayer(makeInput({ mlbStatus: "Active" }));
    expect(result.mlbStatus).toBe("Active");
  });

  it("normalizes null mlbStatus to undefined", () => {
    // Server emits `null` on the wire when no status is known (free agent,
    // synthetic row). Team.tsx pre-coalesces to undefined; this guard is a
    // defense-in-depth: if a future caller forwards null directly the
    // mapper still hides it from the chip-detection logic.
    const result = toHubPlayer(makeInput({ mlbStatus: null }));
    expect(result.mlbStatus).toBeUndefined();
  });

  it("passes mlbStatusDaysAgo through for the chip body", () => {
    // The chip renders "X days ago" when this is a number — drives the
    // freshness signal next to the verbatim status.
    const result = toHubPlayer(
      makeInput({ mlbStatus: "Injured 10-Day", mlbStatusDaysAgo: 3 }),
    );
    expect(result.mlbStatusDaysAgo).toBe(3);
  });

  it("ghost-IL gap: active-roster row carrying mlbStatus indicating IL", () => {
    // The exact scenario the chip wakes up on — assignedPosition is NOT
    // "IL" but mlbStatus says Injured. Team.tsx's ghostIlSuspects filter
    // pulls these rows out for the warning chip.
    const result = toHubPlayer(
      makeInput({
        assignedPosition: "OF",
        mlbStatus: "Injured 10-Day",
      }),
    );
    expect(result.assignedSlot).toBe("OF");
    expect(result.mlbStatus).toBe("Injured 10-Day");
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
