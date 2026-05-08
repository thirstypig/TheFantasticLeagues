---
status: complete
priority: p2
issue_id: "169"
tags: [code-review, wire-list, typescript, type-safety]
dependencies: []
---

# Wire List: type-safety sweep — req.body casts, status:string, duplicate types, hand-rolled returns

## Problem Statement

Four overlapping type-safety gaps in the wire-list feature compound into a real risk: every safety net we have (Zod inference, discriminated unions, shared schemas, Prisma generated types) is bypassed in at least one place, so a downstream rename or status enum addition will compile-pass and break in production.

## Findings

**(a) `req.body as { ... }` casts ignore Zod-inferred types.**
- `server/src/features/wire-list/routes.ts:255` (and similar at L304, L408, L468) — `const body = req.body as { teamId: number; ... }`. Zod schema runs but the inferred type is discarded.

**(b) `status: string` discards `WaiverPeriodStatus` discriminated union.**
- `server/src/features/wire-list/routes.ts:43` — `period.status: string`
- `server/src/features/wire-list/processor.ts:55, 62` — `outcome: string`
- A typo like `"PROCCESSED"` would compile.

**(c) Client redeclares shared schemas.**
- `client/src/features/wire-list/api.ts:9-57` — `interface WaiverPeriod`, `AddEntry`, `DropEntry` parallel to `shared/api/*` (or what should live there). Drift inevitable.

**(d) Hand-rolled select return type.**
- `server/src/features/wire-list/processor.ts:42-84` — `loadAddEntryAsCommissioner` declares a 14-line literal return type. Should use `Prisma.WaiverAddEntryGetPayload<{ select: typeof addSelect }>` with `satisfies`.

## Proposed Solutions

### Option 1: One sweep PR fixing all four (recommended)
- (a) Replace `req.body as ...` with `const body = createAddEntryBodySchema.parse(req.body)` or import `CreateAddEntryBody` from shared.
- (b) Use `WaiverPeriodStatus` and `WaiverAddOutcome` enums in all interfaces.
- (c) Move client interfaces to `shared/api/wireList.ts` (Zod schema; client and server import the inferred type). Per `CLAUDE.md` — server uses relative `.js` path, client uses `@shared/*`.
- (d) Use `Prisma.WaiverAddEntryGetPayload`.

**Effort:** Medium (~3-4h). **Risk:** Low — pure type changes, runtime unchanged.

### Option 2: Split per-issue
Less context-switching cost but more PRs, more reviewer load.

**Effort:** Same total. **Risk:** Same.

### Option 3: Defer (c) until shared/api migration broader
(a), (b), (d) are fast wins; (c) requires choosing between server-relative-`.js` and `@shared/*` import paths and matches the broader migration. If shared-api work is queued, fold (c) into it.

**Effort:** Smaller now. **Risk:** Continued client/server drift on the wire-list types.

## Recommended Action

**Option 1.** Per memory `feedback_shared_package_json_required.md`, when shared/api adds runtime imports (not type-only), `package.json` `"type": "module"` is required for the shared dir — verify before adding.

## Technical Details

- Files: `server/src/features/wire-list/routes.ts`, `server/src/features/wire-list/processor.ts`, `client/src/features/wire-list/api.ts`, new `shared/api/wireList.ts`
- Verify CI typecheck passes (per memory `local_server_tsc_zod_false_negative.md` — local `tsc` may give false negatives on shared schemas)

## Acceptance Criteria

- [ ] No `req.body as` casts in wire-list routes
- [ ] All status fields typed with the Prisma enum, not `string`
- [ ] Client wire-list types are re-exports of `shared/api/wireList.ts` inferred types
- [ ] `loadAddEntryAsCommissioner` uses `Prisma.WaiverAddEntryGetPayload`
- [ ] CI typecheck passes (local may differ — CI is authority)

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Project memory: `feedback_shared_package_json_required.md`, `local_server_tsc_zod_false_negative.md`
- `docs/CONTRACT_TESTING.md`
- Files: `server/src/features/wire-list/routes.ts`, `processor.ts`, `client/src/features/wire-list/api.ts`
