---
status: pending
priority: p3
issue_id: "154"
tags: [code-review, simplicity, architecture, aurora]
dependencies: []
---

# PR #234 follow-ups: aurora.css home rules, stale memo comment, fmtRate dedupe

## Problem Statement

`/ce:review` on PR #234 surfaced three small follow-ups that were out of scope for the P1 fix-then-merge but should be cleaned up next sweep.

## Findings

### 1. `home-bento` rules in the wrong stylesheet
`client/src/components/aurora/aurora.css:144-173` now contains Home-page-specific bento layout (`.home-bento`, `.home-span-*`, `.home-quick-grid`, plus media queries). `aurora.css` is the design-system token sheet imported by 10+ pages; page-local layout doesn't belong there. The repo already has a precedent comment at `client/src/features/teams/components/RosterHub/rosterHub.css` explicitly stating "extract to `aurora.css` once the patterns are validated" — i.e. extract on proven reuse, not on first move. Move these rules to `client/src/pages/home.css` and import from `Home.tsx`.

### 2. Stale memo comment in `EligibilityChips`
`client/src/features/teams/components/RosterHub/EligibilityChips.tsx:24` comment claims it "relies on parent `RosterRow` (`React.memo`)" for stable inputs. False after PR #234 — the parent rows no longer use `React.memo`. Update or delete the comment.

### 3. Duplicate `fmtRate` definitions (pre-existing)
Identical implementations at `client/src/api/base.ts:265` and `client/src/lib/sports/baseball.ts:170`. PR #234 picked the latter (consistent with already-imported `isPitcher`), but the duplication itself predates this PR. `lib/sports/baseball.ts:205` references `formatFn: "fmtRate"` as a stat-config token, which suggests that file is the intended canonical home. Have `api/base.ts` re-export from `lib/sports/baseball.ts` and update the 5 consumers (`ArchivePage`, `DraftReportPage`, `PlayerStatsColumns`, `StatsTables`, `PlayersLegacy`).

## Proposed Solutions

### Option 1: Single follow-up sweep (recommended)
Bundle all three into one small PR. Effort: Small (~30 min). Risk: Low — items 1 and 2 are pure relocations/comment fixes; item 3 is a re-export with no behavioral change.

## Recommended Action

(triage)

## Technical Details

**Affected files:**
- `client/src/components/aurora/aurora.css` (delete `home-bento` rules)
- `client/src/pages/home.css` (new — receives the rules)
- `client/src/pages/Home.tsx` (add import)
- `client/src/features/teams/components/RosterHub/EligibilityChips.tsx` (comment edit)
- `client/src/api/base.ts` (re-export `fmtRate` from `lib/sports/baseball`)

## Acceptance Criteria

- [ ] `home-bento` and related rules live in a page-local stylesheet, not `aurora.css`
- [ ] Home renders identically after the move (browser smoke)
- [ ] `EligibilityChips` comment reflects current memo state
- [ ] Single source of truth for `fmtRate`; all consumers compile without changes

## Work Log

- 2026-05-04 — Created during `/ce:review` of PR #234 (`chore/p3-sweep-170`).

## Resources

- PR #234: https://github.com/thirstypig/thefantasticleagues-app/pull/234
- Precedent: `client/src/features/teams/components/RosterHub/rosterHub.css` header comment
