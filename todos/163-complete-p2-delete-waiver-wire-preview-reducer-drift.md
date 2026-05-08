---
status: complete
priority: p2
issue_id: "163"
tags: [code-review, wire-list, architecture, drift]
dependencies: []
---

# Wire List: Delete WaiverWirePreview.tsx — reducer drift vs. server processor

## Problem Statement

`client/src/pages/design/WaiverWirePreview.tsx` re-implements the consume/free state machine that lives canonically at `server/src/features/wire-list/processor.ts`. The design preview was scaffolding to validate the two-list UX before ADR-012 landed; now that the production owner page (`/teams/:code/wire-list`) and commissioner reducer are live, the preview is a parallel reducer drifting from its source of truth.

Per project memory `feedback_design_preview_loop.md`, design previews are throwaway scaffolding meant to be deleted once direction is locked. Keeping this file alive guarantees future divergence — anyone editing it will mistake it for canonical logic.

## Findings

**Duplicated reducer rules:**
- `client/src/pages/design/WaiverWirePreview.tsx:493-518` — `markOutcome` re-implements three rules:
  - Free-on-leave (preview L499-503) ↔ server `processor.ts:583-595`
  - Consume-on-enter (preview L506-510) ↔ server `processor.ts:425-481`
  - No-drop-available (preview auto-skips silently) ↔ server `processor.ts:?` (returns 409 `NO_DROP_AVAILABLE`)

**Already disagreeing:** Rule 3 has diverged — preview silently auto-skips when no drop is available; production rejects with 409. A user testing the preview today will form an incorrect mental model of the production behavior.

**Wire-up:**
- Lazy import at `client/src/App.tsx:75`
- Route at `client/src/App.tsx:288-291` (`/design/waiver-wire`)
- ~872 LOC total in the preview file

## Proposed Solutions

### Option 1: Delete the preview (recommended)
Remove `client/src/pages/design/WaiverWirePreview.tsx`, the lazy import at `App.tsx:75`, and the route at `App.tsx:288-291`. Net -872 LOC.

**Effort:** Trivial (~10 min). **Risk:** None — production has owned this UX since ADR-012.

### Option 2: Extract pure reducer to `shared/lib/wireListReducer.ts`
If the preview must survive (it doesn't), pull the consume/free state machine into a shared module that both the preview and `processor.ts` import. Server adopts it as the single source of truth.

**Effort:** Medium (~3h, with tests). **Risk:** Medium — touches the live processor's hottest path.

### Option 3: Mark the route dev-only
Gate behind `import.meta.env.DEV`. Doesn't fix drift; still misleading.

**Effort:** Trivial. **Risk:** Drift continues.

## Recommended Action

**Option 1.** The preview served its purpose; deleting it is a pure cleanup with zero downside.

## Technical Details

- Files removed: `client/src/pages/design/WaiverWirePreview.tsx`
- Files edited: `client/src/App.tsx` (delete import L75, delete route L288-291)
- No server changes
- No migration required
- No test changes (preview has no tests)

## Acceptance Criteria

- [ ] `client/src/pages/design/WaiverWirePreview.tsx` no longer exists
- [ ] `/design/waiver-wire` route returns 404 in dev
- [ ] `cd client && npx tsc --noEmit` passes
- [ ] `npm run test:client` passes
- [ ] No remaining references to `WaiverWirePreview` in the codebase

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Project memory: `feedback_design_preview_loop.md`
- ADR-012 (canonical wire-list design)
- Past wire-list PRs: https://github.com/thirstypig/TheFantasticLeagues/pulls?q=wire-list+is%3Amerged
- Server canonical: `server/src/features/wire-list/processor.ts:382-606`
