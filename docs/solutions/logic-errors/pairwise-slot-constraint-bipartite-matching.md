---
title: "Roster slot conflicts: pairwise eligibility check rejects valid moves that need a chain reshuffle"
category: logic-errors
tags:
  - roster-moves
  - position-eligibility
  - bipartite-matching
  - hopcroft-karp
  - prisma-transaction
  - constraint-design
  - assignment-problem
  - yahoo-fantasy-pattern
module: transactions
symptom: "Owner submits a legal-looking add+drop pair (e.g., add 2B-only player, drop OF-only player) and the server rejects with `POSITION_INELIGIBLE`. The owner has no clear path forward — error message is technically correct but offers no remediation, and the workaround (manually shuffle other roster slots first to free a 2B-eligible slot, then submit the add+drop) is invisible UX. In an exact-cap roster (OGBA = 23 active, 0 bench), almost every pickup hits this."
root_cause: "`assertAddEligibleForDropSlot` enforced **strict pairwise alignment**: the added player's eligible positions had to include the dropped player's current `assignedPosition` slot. The check ignored the rest of the roster — even when a legal end-state existed via a 1-3 player reshuffle. The constraint was mathematically too narrow: a *pairwise* eligibility test instead of a *transitive* assignment test across the full roster. This is the textbook 'pairwise constraint masquerading as a system-level constraint' anti-pattern."
severity: medium
date_resolved: 2026-04-29
session: 82
---

# Roster slot conflicts: pairwise eligibility check rejects valid moves that need a chain reshuffle

## Symptom

User reports they can't add a player they should be allowed to add:

> "I want to add a 2B free agent. My 2B slot is full but I want to drop an OF — they're a worse player. The system rejects with 'position ineligible'. I'm stuck."

The reported error from `server/src/features/transactions/lib/positionInherit.ts:40-51`:

```
POSITION_INELIGIBLE: Player [X] (2B) is not eligible for the OF slot
```

Technically correct. UX-broken. The owner's intent is "add the 2B, drop the OF, figure out the slot fit" — exactly what every mature fantasy platform (Yahoo, ESPN, Sleeper, Fantrax, NFBC) does silently for the user.

## Investigation

### Why the original constraint exists

`assertAddEligibleForDropSlot` was added in the roster-rules feature work (Sessions 71-75). The intent was: "you can't replace a 2B with a player who isn't 2B-eligible — that creates an illegal lineup."

That intent is *correct*. The bug is that the implementation conflates two questions:

1. **Q1**: Is there a legal lineup post-add+drop? (System-level question)
2. **Q2**: Is the added player eligible for the dropped player's *current* slot? (Pairwise question)

Q2 is sufficient when the added and dropped players are the *only* movement. But owners frequently want chain reshuffles: "add Betts at 2B, slide Turner from 2B to SS, slide the SS guy to MI, drop the OF guy." The pairwise check rejects this because Q1 is true (legal end-state exists) while Q2 is false (Betts isn't OF-eligible).

### Codebase audit

Three endpoints used the strict check:

```
server/src/features/transactions/routes.ts:214  /claim
server/src/features/transactions/routes.ts:565  /il-stash
server/src/features/transactions/routes.ts:799  /il-activate
```

All three require the same fix.

### Prior-art research

Yahoo, ESPN, Fantrax, Sleeper, NFBC all decouple roster (the *set* of players you own) from lineup (which slot each plays). Adds default to bench; slot-fit is solved via a separate Swap Mode. This works because they all have bench slots. **OGBA explicitly does not** — 23 active, 0 bench, deliberate league rule.

So the standard "default to bench" escape hatch doesn't apply. The correct response is to **answer Q1 directly** instead of approximating it via Q2.

## Root Cause

The check is the wrong shape. It treats slot fit as a pairwise predicate when it's actually a [bipartite matching problem](https://en.wikipedia.org/wiki/Maximum_cardinality_matching):

- **Vertex set 1**: every player on the team (23 active rows after add+drop is applied to the data, IL pinned)
- **Vertex set 2**: every active slot, capacity-expanded (P×9 → P0..P8, OF×5 → OF0..OF4, etc.)
- **Edge `(player, slot_i)`**: exists iff `slotsFor(player.posList).has(slotKey)`

The legal lineup question becomes: "does a perfect matching exist that covers all 23 slots?" If yes, apply the matching. If no, return a useful error.

For OGBA's roster: N=23, edges ≤ 23 × ~12 ≈ 276. [Hopcroft–Karp](https://en.wikipedia.org/wiki/Hopcroft%E2%80%93Karp_algorithm) runs in O(E·√V) — comfortably under 10ms in Node. Tractable.

## Fix

### Step 1 — replace the pairwise check with a bipartite matcher

New module at `server/src/features/transactions/lib/slotMatcher.ts` (260 lines):

```ts
interface RosterCandidate {
  rosterId: number;
  playerId: number;
  posList: string;
  currentSlot: string | null;
  pinned?: boolean;  // IL rows always pinned
}

interface SlotAssignment {
  rosterId: number;
  oldSlot: string | null;
  newSlot: string;
}

type MatchResult =
  | { ok: true; assignments: SlotAssignment[] }
  | {
      ok: false;
      code: "NO_LEGAL_ASSIGNMENT";
      reason: string;
      unfilledSlots: string[];
      unassignedPlayers: number[];
    };

function resolveLineup(
  candidates: RosterCandidate[],
  slotCapacities: Record<string, number>,
): MatchResult;
```

Implementation: Kuhn-style augmenting-path search (simpler than full Hopcroft-Karp, equivalent perf at N=23) with **incumbent-preserving seeding** — when multiple legal matchings exist, prefer the one that moves the fewest players. Implemented by listing each player's current slot first in their edge list, so the augmenting search visits incumbent edges before alternatives.

### Step 2 — wire into the three transaction endpoints

Replace each `assertAddEligibleForDropSlot(...)` call with:

```ts
// Inside the existing prisma.$transaction, AFTER the drop+create writes
const candidates = await loadRosterCandidates(tx, teamId);
const match = resolveLineup(candidates, OGBA_SLOT_CAPACITIES);

if (!match.ok) {
  throw new RosterRuleError(
    "NO_LEGAL_ASSIGNMENT",
    match.reason,
    { unfilledSlots: match.unfilledSlots, unassignedPlayers: match.unassignedPlayers },
  );
}

for (const assignment of match.assignments) {
  await tx.roster.update({
    where: { id: assignment.rosterId },
    data: { assignedPosition: assignment.newSlot },
  });
}

return { success: true, appliedReassignments: enrichWithPlayerNames(match.assignments) };
```

Critical: the matcher runs **after** the add/drop writes inside the transaction, so it sees the post-mutation state and only emits deltas for rows where the slot actually changed. Playernames flow through `RosterCandidate` to avoid an N+1 lookup at response time.

### Step 3 — re-read eligibility inside the transaction (race protection)

The 12:00 UTC `syncPositionEligibility` cron updates `Player.posList`. If a sync runs between request submission and processing, the matcher might see stale eligibility. Mitigation:

```ts
// Inside the transaction, re-read posList for involved players
const fresh = await tx.player.findMany({
  where: { id: { in: candidates.map(c => c.playerId) } },
  select: { id: true, posList: true },
});
const drift = fresh.some(p => p.posList !== candidatesById.get(p.id)?.posList);
if (drift) {
  // Re-run matcher with fresh data
  const reMatch = resolveLineup(updateCandidatesWithFresh(candidates, fresh), OGBA_SLOT_CAPACITIES);
  if (!reMatch.ok) {
    throw new RosterRuleError(
      "ELIGIBILITY_LOST_MID_OPERATION",
      "Player eligibility changed during processing. Please retry.",
      reMatch,
    );
  }
  return reMatch;
}
```

### Step 4 — feature flag for backward compatibility

Behind `LeagueRule(transactions.auto_resolve_slots)`, defaulting `'true'` for OGBA league 20 and `'false'` elsewhere (idempotent INSERT in the migration). Lets other leagues opt out if strict pairwise is desired.

```sql
INSERT INTO "LeagueRule" ("leagueId", "key", "value")
SELECT id, 'transactions.auto_resolve_slots', 'true' FROM "League" WHERE id = 20
ON CONFLICT ("leagueId", "key") DO NOTHING;
```

### Step 5 — surface what shuffled in the response

Response shape addition (additive, non-breaking):

```ts
interface AppliedReassignment {
  rosterId: number;
  playerId: number;
  playerName: string;
  oldSlot: string;
  newSlot: string;
}
// /claim, /il-stash, /il-activate response now includes:
{ success: true, ..., appliedReassignments: AppliedReassignment[] }
```

Client renders a toast: `"Claimed Mookie Betts. Also moved: Trea Turner 2B → SS, Alec Bohm SS → MI."` — implemented via `formatReassignmentsToast()` in `client/src/features/transactions/api.ts`.

## Verification

PR #167 (commit `658822b`) shipped this fix. Verification:

- 16 matcher unit tests covering happy path / multi-eligibility / unsolvable / IL preservation / partial reshuffle / incumbent-preference / capacity expansion / etc.
- 11 contract tests on the `autoResolveLineup` Prisma bridge
- 10 endpoint integration tests across `/claim`, `/il-stash`, `/il-activate`
- 5 client-side toast wiring tests
- 8 unit tests on the `formatReassignmentsToast` helper (added in this session)

The original failing scenario now succeeds: claim Betts (2B-only) while dropping Aaron Judge (OF) → server reshuffles Turner 2B→SS, Bohm SS→MI, Betts lands at 2B, Judge dropped. Toast tells the user what shuffled.

## Lessons

1. **Pairwise constraints frequently masquerade as system-level constraints.** When a UX feels too restrictive but the validation is "correct," check whether the validation is asking the *narrow* version of the question. Often the right fix is to formulate the system-level question (here: "does a legal end-state exist?") and answer it directly rather than approximating with pairwise predicates.

2. **The matching problem is in your codebase, you just don't see it.** Roster slots, draft positions, lineup positions, available agents to tasks — anywhere you have an N×M assignment with constraints, bipartite matching is the right primitive. It's not graduate-level CS; Hopcroft-Karp / Kuhn's are 50-100 line implementations and run in microseconds at our scale.

3. **Incumbent preference matters as much as legality.** A naive matcher would solve the user's problem but produce psychotic UX: every add could shuffle 5 players unnecessarily. Adding "prefer matchings that retain incumbents" is a tiny algorithmic addition (list incumbent edges first) that changes the UX from "wait, why did everyone move?" to "oh, just two players moved, makes sense." Test for this explicitly.

4. **`appliedReassignments` in the response is the difference between magic and confusing magic.** Auto-resolve without telling the user what shuffled is creepy. The toast `"Also moved: Trea Turner 2B → SS"` makes the magic legible. This is general — any time a server makes an autonomous decision on the user's behalf, return what it did, not just whether it succeeded.

5. **Run the matcher INSIDE the transaction.** The temptation is to validate eligibility *before* the transaction (cheaper read), then commit the writes. But a daily eligibility sync running between read and write produces silent corruption — the matcher sees stale `posList`. Re-read inside the transaction; throw `ELIGIBILITY_LOST_MID_OPERATION` on drift. The retry cost is rare; the silent corruption is unbounded.

6. **Feature flag the new behavior unless it's truly universal.** Auto-resolve is correct for OGBA but might surprise leagues that intentionally enforce strict pairwise (rare, but not impossible). `LeagueRule(transactions.auto_resolve_slots)` lets the new behavior opt-in per league. Default to whatever's right for the active league; let opt-outs exist as a safety valve.

## Detection / future-proofing

To find similar pairwise-vs-system constraint mismatches in the codebase:

```sh
# Look for pairwise eligibility checks that might be too narrow
grep -rn "assert.*Eligible\|isEligibleFor\|canAssign" server/src --include="*.ts" | grep -v test
```

Each hit is a candidate. Ask: "if this rejects, is there a legal end-state via reshuffling?" If yes, replace with a system-level matcher.

## Related

- `docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md` — the full roster-moves plan; §0 captures the deepening pass that validated this approach against Yahoo/ESPN/Fantrax 2026 prior art.
- `docs/solutions/deployment/supabase-railway-ipv6-pooler-and-pool-exhaustion.md` — separate incident; same lesson on running things inside vs. outside transactions (eligibility re-read here mirrors the migration's pool-slot management).
- `docs/solutions/ui-bugs/auction-ux-position-dropdown-ohtani-stats-api-migration.md` — companion: position eligibility data must come from `positionToSlots()` / `Player.posList`, never hardcoded. The matcher consumes these.
- PR #167 (commit `658822b`) — the implementation.
- Memory: `~/.claude/projects/.../memory/position_eligibility_layers.md` — describes the 3-layer eligibility ladder (Rule 1/2/3) that produces `Player.posList`.
