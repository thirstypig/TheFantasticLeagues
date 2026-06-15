---
status: pending
priority: p2
issue_id: 290
tags: [code-review, documentation, roster, teams, correctness]
dependencies: []
---

## Problem Statement

`docs/solutions/logic-errors/period-roster-historical-il-display-and-gte-boundary.md` documents the May-14 commit (`1020296`) that changed `releasedAt: gt → gte` as "the correct fix" — reasoning that "a player released at exactly `period.startDate` (midnight UTC) is still on the team at the period's opening moment and belongs in that period."

PR #400 (2026-06-12) proves this reasoning was wrong: those players owned **zero days** of the new period and belong in the prior period's view exclusively. The `gte` change was the bug, not the fix. The solution document now gives incorrect, actively misleading guidance to future developers encountering a similar boundary question.

If a developer reads the solution doc before touching the period-roster endpoint (as intended), they will be steered toward `gte` — re-introducing the ghost-row bug that took until PR #400 to discover.

## Findings

- **File**: `docs/solutions/logic-errors/period-roster-historical-il-display-and-gte-boundary.md`
- **Learnings-researcher agent**: flagged this as "CRITICAL — prior instance where the OPPOSITE direction was chosen"
- **The conflict**: The document says `gte` is correct; CLAUDE.md (updated post PR #400) explains `gt` is correct
- **Root cause of the original confusion**: The May-14 developer saw a player "vanishing entirely" when switching periods. The vanishing was actually caused by the acquisition boundary (`acquiredAt: lt` missed final-day acquisitions) — NOT the release boundary. Fixing the wrong side produced the ghost-row bug.

## Proposed Solutions

### Option A — Rewrite the doc to reflect the correct understanding (Recommended)
Update the solution doc to:
1. Explain why `gte` was chosen originally (the "vanishing player" misdiagnosis)
2. Explain why it was wrong (zero-days-owned players appear in both periods)
3. Document the PR #400 fix: `gt` + `lte acquiredAt` + server-side dedup
4. Link to `lib/rosterWindow.ts` as the canonical boundary semantics reference

- **Pros**: Fixes institutional knowledge; future developers get the right guidance
- **Cons**: Takes ~20 min to write well
- **Effort**: Small
- **Risk**: None

### Option B — Delete the doc
Remove `period-roster-historical-il-display-and-gte-boundary.md` entirely if it's too misleading to repair.

- **Pros**: Eliminates false guidance fast
- **Cons**: Loses the IL-position issue documented in Bug #2 of the doc (still valid)
- **Effort**: Trivial
- **Risk**: Low (loses context on the IL position problem)

## Recommended Action

Option A — rewrite, not delete. The doc also covers the IL position display problem (Bug #2: `assignedPosition` is current-state, not period-scoped), which is a valid separate finding that should not be lost. Update the boundary section to document the full arc: original bug → wrong fix → correct fix.

## Technical Details

- **Affected file**: `docs/solutions/logic-errors/period-roster-historical-il-display-and-gte-boundary.md`
- **The correct boundary semantics**: `releasedAt: { gt: period.startDate }` (half-open, matching `ownedOn`) + `acquiredAt: { lte: period.endDate }` (inclusive final-day)
- **PR that established correct answer**: #400 (2026-06-12)

## Acceptance Criteria

- [ ] The doc no longer says `gte` is the correct boundary for the period-roster endpoint
- [ ] The doc explains the root cause of the original confusion (acquisition bound was the real "vanishing" bug)
- [ ] The doc cross-references `lib/rosterWindow.ts` and PR #400
- [ ] The IL-position display problem (Bug #2) is preserved
- [ ] `git mv` this todo to complete

## Work Log

- **2026-06-13**: Created via code review of PR #400 (learnings-researcher agent flagged the conflict). The same solution library that should prevent regressions currently gives incorrect guidance.
