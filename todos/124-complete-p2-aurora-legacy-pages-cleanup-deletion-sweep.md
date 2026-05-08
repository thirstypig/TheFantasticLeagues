---
status: complete
priority: p2
issue_id: "124"
tags: [code-review, cleanup, aurora, dead-code]
dependencies: ["116"]
---

# Aurora Legacy escape-hatch sweep — delete dead routes (carefully)

## Problem Statement

Per CLAUDE.md, "Aurora design system rollout is complete — every routed page from login through admin uses the unified Aurora chrome." That makes 9 `*Legacy.tsx` pages and their `*-classic` routes vestigial — except some still carry behavior the live code depends on (see Caveats).

Routes today:
- `/home-classic` (HomeLegacy)
- `/teams/:code/classic` (TeamLegacy) — CAVEAT: still the only producer of `_dbPlayerId`/`_dbTeamId` enrichment that RosterMovesTab panels depend on (see todo #116)
- `/auction-values-classic` (AuctionValuesLegacy)
- `/season-classic`, `/players-classic`, `/matchup-classic`, `/auction-classic`, `/auction-results-classic`, `/activity-classic`

Plus `/design/roster-hub` + `/design/swap-mode` — preview pages that still mount the v2 `RosterHub`/`RosterRow`/`MobileRow`/`EligibilityChips`/`IlSection` family. v3 is what production renders. v2 has no other consumer.

Plus `AuctionValuesLegacy.test.tsx` — 10 unit tests against dead UI.

## Findings

- `client/src/App.tsx:154, 171, 222, 273, 279` — Legacy routes
- `client/src/features/teams/components/RosterHub/{RosterHub,RosterRow,MobileRow,EligibilityChips,IlSection}.tsx` — v2 family, no production consumer
- `client/src/features/teams/pages/TeamLegacy.tsx:222,244` — only producer of `_dbPlayerId` enrichment (BLOCKING — see todo #116)
- `client/src/features/auction/__tests__/AuctionValuesLegacy.test.tsx` — 10 tests
- `CLAUDE.md` `/auction-classic`: "Live-floor escape hatch (PR-3 strangler-fig). Use this if the Aurora live floor regresses mid-draft." — only Legacy with documented user-facing rationale

## Proposed Solutions

### Option 1: Phased deletion, blocked on #116 for TeamLegacy (recommended)

**Phase 1 (now, no blockers):**
- Delete `/auction-values-classic` route + `AuctionValuesLegacy.tsx` + 10 test cases (incl. the Aurora "footer escape link" assertion)
- Delete `/home-classic`, `/season-classic`, `/players-classic`, `/matchup-classic`, `/auction-results-classic`, `/activity-classic` + their pages
- Delete `/design/roster-hub` + `RosterHubPreview.tsx`
- Delete v2 components: `RosterHub.tsx`, `RosterRow.tsx`, `MobileRow.tsx`, `EligibilityChips.tsx`, `IlSection.tsx`
- Update `client/src/features/teams/components/RosterHub/index.ts` barrel exports
- KEEP `/auction-classic` through next live-auction window

**Phase 2 (after todo #116 ships):**
- Delete `/teams/:code/classic` + `TeamLegacy.tsx` once enrichment is owned by the shared loader, not legacy

**Pros:**
- ~3,000-4,000 LOC swept
- Removes maintenance surface
- Removes risk of accidentally keeping v2 alive via design-preview imports

**Cons:**
- Need to verify no link from production code references each Legacy route before deleting

**Effort:** Phase 1: ~2 hours. Phase 2: ~30 min after #116.

**Risk:** Low if grep-verified pre-deletion

### Option 2: Keep all Legacy routes for now

**Approach:** Defer until next session.

**Cons:** Carries weight, encourages future drive-by edits to "preserve" Legacy code

**Effort:** Zero

## Recommended Action

Option 1 Phase 1 next session. Phase 2 after todo #116 is resolved.

## Technical Details

**Affected files:**
- `client/src/App.tsx` (delete 8 route declarations)
- 8 `*Legacy.tsx` page files (delete; keep `TeamLegacy.tsx` for now)
- `client/src/features/teams/components/RosterHub/{RosterHub,RosterRow,MobileRow,EligibilityChips,IlSection}.tsx`
- `client/src/features/teams/components/RosterHub/index.ts` (remove v2 barrel exports)
- `client/src/pages/RosterHubPreview.tsx`, `client/src/pages/SwapModePreview.tsx`
- `client/src/features/auction/__tests__/AuctionValuesLegacy.test.tsx`
- `client/src/features/auction/__tests__/AuctionValuesAurora.test.tsx` — drop the footer-escape-link assertion

## Acceptance Criteria

- [ ] No production code links to `*-classic` routes (other than `/auction-classic`)
- [ ] No imports of v2 RosterHub family
- [ ] Phase 1 deletes ~3,000-4,000 LOC
- [ ] tsc + vitest pass
- [ ] Browser smoke: every non-deleted page still loads

## Resources

- **Source:** Code-simplicity-reviewer P1 #3 + architecture-strategist P3
- **Memory:** `aurora_rollout_pattern.md`
- **Blocking:** Todo #116 (RosterMovesTab data shape)

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review code-simplicity-reviewer
- **Learnings:** Architecture-strategist independently flagged that TeamLegacy can't be deleted yet because it owns enrichment the new path silently depends on. Phasing matters.
