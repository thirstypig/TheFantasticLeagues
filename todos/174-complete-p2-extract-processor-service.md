---
status: pending
priority: p2
issue_id: "174"
tags: [code-review, wire-list, architecture, refactor]
dependencies: []
---

# Wire List: extract processorService — processor.ts mixes routing + auth + domain + side-effects

## Problem Statement

`server/src/features/wire-list/processor.ts` is 655 LOC and conflates Express routing, auth (`loadAddEntryAsCommissioner`), Zod validation, domain logic (consume/free state machine), persistence, and side-effects (push delivery, audit logging). The `/finalize` handler alone is 247 lines (L130-377). The pattern diverges from `standingsService` and `CommissionerService` elsewhere in the codebase, and the test-coverage gap (todo #168) is structural — pure functions are far easier to test than 247-line route handlers.

## Findings

- File: `server/src/features/wire-list/processor.ts` — 655 LOC
- `/finalize` handler: L130-377 (247 lines)
- Mixes: Express handler + Zod parse + Prisma transaction + push fan-out + audit log
- Other features factor service from routes: `standings/services/standingsService.ts`, `commissioner/services/CommissionerService.ts`, `seasons/services/seasonService.ts`

## Proposed Solutions

### Option 1: Extract `wire-list/services/processorService.ts` (recommended)
Move the reducer to a service module with pure(-ish) functions:
- `succeedAdd(periodId, addId, ctx): Promise<UpdatedEntry>`
- `failAdd(periodId, addId, ctx)`, `skipAdd(periodId, addId, ctx)`
- `revertAdd(periodId, addId, ctx)`
- `finalizePeriod(periodId, ctx): Promise<FinalizeResult>`
- `lockPeriod(periodId, ctx)`

Routes become 5-line dispatchers (parse → call service → return). Auth helper and audit logging stay in the route layer where they belong.

**Effort:** Medium (~6h). **Risk:** Medium — large refactor, but no behavior change. Pair with todo #168 to lock behavior with tests in same PR.

### Option 2: Split `/finalize` only
Targeted at the worst handler. Smaller PR, leaves the rest of the drift in place.

**Effort:** Small-medium (~3h). **Risk:** Low.

### Option 3: Defer
Status quo. The reducer-test gap (#168) becomes harder to close.

## Recommended Action

**Option 1**, paired with todo #168 (write the tests before/during extraction so behavior is locked). Order: (a) write tests against current code, (b) extract service, (c) tests stay green.

## Technical Details

- New file: `server/src/features/wire-list/services/processorService.ts`
- `server/src/features/wire-list/processor.ts` becomes a thin route layer
- Update `CLAUDE.md` cross-feature dependency table if extraction changes imports
- No schema changes, no API contract changes

## Acceptance Criteria

- [ ] `processorService.ts` exposes `succeedAdd`, `failAdd`, `skipAdd`, `revertAdd`, `finalizePeriod`, `lockPeriod`
- [ ] Route handlers are ≤30 lines each
- [ ] Auth + Zod parse remain at route layer
- [ ] All wire-list tests pass (existing + new from #168)
- [ ] Browser smoke: full commissioner flow on a PENDING period still works end-to-end

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- File: `server/src/features/wire-list/processor.ts`
- Pattern: `server/src/features/standings/services/standingsService.ts`, `server/src/features/commissioner/services/CommissionerService.ts`
- Related: todo #168 (tests), #170 (handler dedup folds into this)
