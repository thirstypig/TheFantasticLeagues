---
status: pending
priority: p1
issue_id: "116"
tags: [code-review, correctness, teams, transactions, v3-hub, drift]
dependencies: []
---

# RosterMovesTab panels broken on v3 surface — `_dbPlayerId` / `_dbTeamId` / `assignedPosition` never enriched

## Problem Statement

The 3 manage sub-routes shipped in PR #182 (`/teams/:code/manage/{claim,il-stash,il-activate}`) mount `AddDropPanel` / `PlaceOnIlPanel` / `ActivateFromIlPanel` and pass them `players={players as unknown as RosterMovesPlayer[]}` (`Team.tsx:636,643,650`). `players` is the raw output of `getPlayerSeasonStats(leagueId)` (`Team.tsx:212`).

The panels' `dropCandidates` filter requires `_dbTeamId === teamId && assignedPosition !== "IL" && (_dbPlayerId ?? 0) > 0` (`AddDropPanel.tsx:66-67`, `PlaceOnIlPanel.tsx:66-67`, `ActivateFromIlPanel.tsx:68-72`).

**Neither the server endpoint (`server/src/features/players/routes.ts`) nor the client normalizer (`client/src/features/players/api.ts:normalizeTwoWayRow`) sets `_dbPlayerId`, `_dbTeamId`, or `assignedPosition`.** The fields are produced ONLY in `TeamLegacy.tsx:222,244` where TeamLegacy joins its own `dbRoster` onto the season stats CSV.

**Net effect on the v3 surface:** The drop dropdown on `/teams/:code/manage/claim` is empty for the user's own team. Same for the stash candidates on `/manage/il-stash` and the IL list on `/manage/il-activate` (when actual IL players exist).

The `as unknown as RosterMovesPlayer[]` double-cast at the call sites is the smoking gun — a single `as` would have failed; the second cast suppresses the structural mismatch.

## Findings

- `client/src/features/teams/pages/Team.tsx:212` — `setPlayers(stats)` passes raw `PlayerSeasonStat[]`
- `client/src/features/teams/pages/Team.tsx:636,643,650` — three call sites all use `players as unknown as RosterMovesPlayer[]`
- `client/src/features/transactions/components/RosterMovesTab/AddDropPanel.tsx:66-67` — filter requires `_dbPlayerId > 0`
- `client/src/features/transactions/components/RosterMovesTab/AddDropPanel.tsx:43-45` — comment acknowledges FAs lack the field but assumes roster rows have it
- `client/src/features/teams/pages/TeamLegacy.tsx:222,244` — only producer of `_dbPlayerId`/`_dbTeamId` enrichment
- `client/src/features/transactions/components/RosterMovesTab/__tests__/AddDropPanel.test.tsx:55-56` — tests fabricate `_dbPlayerId: 600, _dbTeamId: 147` directly, masking the production gap (precedent: Session 75 fixture authenticity bug per `MEMORY.md` `feedback_test_fixtures.md`)
- PR #182 browser verification only confirmed the FA add dropdown (which uses `mlb_id`, not `_dbPlayerId`) and the empty IL state — not the drop dropdown which is the actual broken surface

**ActivityPage has the same shape** (`client/src/features/transactions/pages/ActivityPage.tsx:351`) but partially papers over it with a fallback: `(p as any)._dbTeamId || teams.find(t => t.name === p.ogba_team_name)?.id` — that fallback runs in ActivityPage's wrapping code, NOT inside the panels themselves. So ActivityPage may have the same latent bug (worth verifying separately).

## Proposed Solutions

### Option 1: Shared loader that enriches stats with roster fields (recommended)

**Approach:** Create `client/src/features/transactions/lib/loadRosterMovePlayers.ts` that fetches `getPlayerSeasonStats` + `getTeamDetails` (or league-wide team list) and returns `RosterMovesPlayer[]` with `_dbPlayerId`/`_dbTeamId`/`assignedPosition` populated by joining the team-detail roster onto stats by `mlb_id`. Both `Team.tsx` and `ActivityPage` call it.

**Pros:**
- Single source of enrichment logic; deletes duplicated joining in TeamLegacy
- Removes the `as unknown as` cast at the call sites (compile-time enforcement)
- Fixes both the v3 surface and the latent ActivityPage gap

**Cons:**
- Two API calls per panel mount unless cached (mitigation: React Query / shared hook)

**Effort:** Medium (~3-4 hours including verification)

**Risk:** Low — pattern matches TeamLegacy's existing logic, just relocated

### Option 2: Lift contract into `shared/api/rosterMoves.ts` as a Zod schema

**Approach:** Define `RosterMovesPlayerSchema` with the actual required fields. Make `RosterMovesPlayer` an inferred type. The double-cast becomes a compile error and forces enrichment to happen.

**Pros:**
- Closes the type-drift class systematically (same lesson as PR #183)
- Matches the `shared/api/` pilot pattern

**Cons:**
- Schema-only without Option 1's enrichment is just a more obvious compile error — still need the loader

**Effort:** Small in addition to Option 1 (~30 min on top)

**Risk:** Low

### Option 3: Refactor panels to fetch their own data

**Approach:** Each panel calls `getTeamDetails(teamId)` itself and computes its own dropCandidates from the typed roster shape. Drop the `players` prop entirely.

**Pros:**
- Cleanest separation; panels self-contained
- Eliminates parent-side enrichment logic everywhere

**Cons:**
- Bigger refactor; touches every panel test
- ActivityPage has a different mount pattern that batches data — would have to reconcile

**Effort:** Large (~1 day)

**Risk:** Medium — touches active production code paths

## Recommended Action

To be decided during triage. **Browser-verify the bug first** (open `/teams/LDY/manage/claim` on local + click into the drop dropdown — should show roster players, will likely show empty). Then Option 1 + Option 2 together is the high-leverage fix — closes both this bug and the broader drift class with one change.

## Technical Details

**Affected files:**
- `client/src/features/teams/pages/Team.tsx:212,636,643,650` — call sites
- `client/src/features/transactions/components/RosterMovesTab/{AddDropPanel,PlaceOnIlPanel,ActivateFromIlPanel}.tsx` — consumers
- `client/src/features/transactions/components/RosterMovesTab/types.ts:5-19` — `RosterMovesPlayer` definition (currently all-optional bag)
- `client/src/features/teams/pages/TeamLegacy.tsx:222,244` — existing enrichment to mirror
- `client/src/features/transactions/pages/ActivityPage.tsx:351` — verify same fix applies
- `shared/api/rosterMoves.ts` — destination for new schema

**No DB or migration changes.**

## Acceptance Criteria

- [ ] Browser-verify the bug on `/teams/LDY/manage/claim` (drop dropdown empty before fix)
- [ ] Drop dropdown populates with user's team roster after fix
- [ ] Stash dropdown populates on `/manage/il-stash`
- [ ] IL list populates on `/manage/il-activate` (test data permitting)
- [ ] Same flows work on `/activity?tab=add_drop` (no regression)
- [ ] `as unknown as RosterMovesPlayer[]` casts removed from `Team.tsx`
- [ ] Unit tests updated to use real fetched shape (no fabricated `_dbPlayerId` on FAs)

## Resources

- **Architecture review:** This todo's source agent flagged this as P1
- **Memory note:** `feedback_test_fixtures.md` — exact pattern recurrence
- **Solution doc precedent:** `docs/solutions/logic-errors/under-declared-ts-type-hid-server-fields.md` (PR #183)
- **PR #182:** Original wiring that created the gap
- **PR #185:** `toHubPlayer.test.ts` — model for testing the new mapper

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review parallel-agent run
- **Actions:** Architecture-strategist agent traced the data flow end-to-end; verified empirically with grep that `_dbPlayerId` is set only in `TeamLegacy.tsx`
- **Learnings:** PR #182 browser verification did not exercise the drop dropdown specifically — only the add dropdown (FAs use `mlb_id`) and empty IL state.
