---
status: pending
priority: p3
issue_id: "178"
tags: [code-review, wire-list, type-safety, validation, hardening]
dependencies: []
---

# Wire-list type-safety + validation hardening (low-risk nits)

## Problem Statement

Smaller nit bundle from the Wire List v1 code review (TS reviewer + Security P3 + Data integrity P3). None of these are bugs in production today — they're hardening items where an implicit contract could collapse silently if a future change drifts from current assumptions. Per the lesson in `feedback_du_interface_extends_trap.md`, type-only contracts that aren't explicitly enforced are exactly the ones that fail without warning.

## Findings

### 1. `req.user!` non-null assertions everywhere
Appears 30+ times across `routes.ts` and `processor.ts`. `requireAuth` does guarantee non-null, but the contract is implicit. Two options:
- Add a typed helper `getAuthedUser(req): User` that throws if missing.
- Augment Express `Request` type globally so any handler downstream of `requireAuth` sees `req.user` as non-nullable.

### 2. Advisory lock keys not centralized
`server/src/index.ts:363` declares `0x57495245 // "WIRE"` inline; other `pg_try_advisory_lock` keys are scattered. Centralize as `server/src/lib/advisoryLocks.ts` exporting an `ADVISORY_LOCKS` const so the codebase has a single audit point for collision risk.

### 3. `RecordOutcomeBodySchema` overloaded
`shared/api/wireList.ts:134-137` is shared between fail and skip with different semantics — fail should require a reason, skip is optional. Split:
- `FailOutcomeBodySchema` — `reason: z.string().min(1)`
- `SkipOutcomeBodySchema` — `reason: z.string().optional()`

### 4. `priority` unbounded
`z.number().int().positive()` accepts `2147483647`. Bound with `.max(999)`.

### 5. `CreatePeriodBodySchema` deadline unbounded
`shared/api/wireList.ts:48-51` accepts `z.string().datetime()` with no upper-bound. Cap with `.max("2100-01-01")` (or sanity check ≤ 1 year out) to prevent commissioners from creating periods 9999 years away.

### 6. Response Zod schemas exported but never `.parse()`-ed
`shared/api/wireList.ts:54-63, 80-92, 116-127, 142-152` export response schemas, but no `fetchJsonApi` consumer runs them at the boundary. Either:
- Wire them into actual runtime validation at the `fetchJsonApi` call sites, OR
- Delete the schemas (keep only the inferred types via `z.infer`).

Pick one — half-shipped validation is worse than none because it implies safety.

### 7. Enum drift insurance
Zod enums for `WaiverPeriodStatus` / `WaiverDropMode` / `WaiverAddOutcome` / `WaiverDropStatus` silently track Prisma enums today. A new Prisma enum value would not break Zod, just silently get rejected at runtime. Add:
```ts
const WAIVER_PERIOD_STATUSES = ["PENDING","LOCKED","PROCESSED"] as const satisfies readonly Prisma.$Enums.WaiverPeriodStatus[];
```
The `satisfies` clause makes drift a compile error. Per `feedback_du_interface_extends_trap.md` — type-only contracts collapse without explicit enforcement.

### 8. `assertPlayerIsFA` empty `mlbTeam`
Empty string currently treated as "FA" — partly covered by todo #175, flagged here for tighter enforcement at the validation layer (reject the request, don't paper over it in the assertion).

### 9. Non-deterministic `rowHash`
`processor.ts:265` and `:279` use `crypto.randomUUID()` for `TransactionEvent.rowHash`. The unique index on `rowHash` is intended for dedup — but a fresh UUID per call defeats it. Use a deterministic key:
```ts
const rowHash = `WIRE-LIST-ADD-${periodId}-${addEntryId}-${playerId}`;
const rowHash = `WIRE-LIST-DROP-${periodId}-${dropEntryId}-${playerId}`;
```
This way, if finalize re-runs (retry, advisory lock contention edge case), the unique index actually prevents the duplicate `TransactionEvent`.

## Proposed Solutions

Land as a single PR. Items 1, 2, 7 are pure typing/refactor. Items 3, 4, 5 are Zod tightening (no client change needed since current usage already conforms). Items 6, 9 have behavior implications and warrant their own commits within the PR.

**Risk note for #9:** changing `rowHash` shape doesn't backfill — existing rows keep their UUID hashes. Going forward the dedup works; historical retry for periods finalized under the old code is still vulnerable. Acceptable since periods aren't replayed in practice.

## Acceptance Criteria

- [ ] No `req.user!` in `wire-list/routes.ts` or `wire-list/processor.ts` — replaced by typed helper or global Request augmentation
- [ ] All `pg_try_advisory_lock` calls reference `ADVISORY_LOCKS.*`
- [ ] `RecordOutcomeBodySchema` split into fail/skip variants with appropriate reason constraints
- [ ] `priority` schemas have `.max(999)`
- [ ] `CreatePeriodBodySchema.deadlineAt` has upper bound
- [ ] Response schemas either runtime-validated at fetch boundary or deleted
- [ ] Zod enum arrays use `as const satisfies readonly Prisma.$Enums.X[]`
- [ ] Empty `mlbTeam` rejected at validation layer in FA-add flow
- [ ] `TransactionEvent.rowHash` deterministic for wire-list add/drop finalize
- [ ] tsc clean in CI; existing wire-list unit + integration tests pass

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Merged Wire List PRs: https://github.com/thirstypig/TheFantasticLeagues/pulls?q=wire-list+is%3Amerged
- `shared/api/wireList.ts`
- `server/src/features/wire-list/routes.ts`
- `server/src/features/wire-list/processor.ts`
- `server/src/index.ts:363` (advisory lock site)
- Related memory: `feedback_du_interface_extends_trap.md` (type-only contracts collapse without enforcement)
- Related memory: `feedback_local_server_tsc_zod_false_negative.md` (CI is the authority on shared schemas)
- Adjacent: todo #175 (FA empty-mlbTeam fail-closed)
