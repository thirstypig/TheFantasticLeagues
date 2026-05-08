---
status: pending
priority: p3
issue_id: "177"
tags: [code-review, wire-list, simplicity, dx]
dependencies: []
---

# Wire-list simplification sweep (bundled cleanups)

## Problem Statement

Bundle of low-risk simplifications surfaced during the Wire List v1 code review (Simplicity reviewer). Each item is small but they share a PR cost — landing them together gives ~120 LOC reduction across the wire-list module (excluding the design-preview deletion already tracked as todo #163 P2) for one review pass.

## Findings

### 1. Duplicate ApiError parsing pattern
`client/src/features/wire-list/api.ts` callers repeat the same `err instanceof ApiError ? err.serverMessage ?? err.displayCode() : String(err)` shape:
- `WireListCommissionerPage.tsx:107-178` — 3 occurrences
- `WireListOwnerPage.tsx:101-185` — 6 occurrences

Add a `wireListErrMsg(err: unknown): string` helper, or just reuse `client/src/api/base.ts ApiError.displayCode()`. ~35 LOC.

### 2. Type re-declaration
`client/src/features/wire-list/api.ts:9-12` redeclares `WaiverPeriodStatus`, `WaiverDropMode`, `WaiverAddOutcome`, `WaiverDropStatus` — all already exported from `shared/api/wireList.ts`. Import via `@shared/*` alias. ~6 LOC.

### 3. Dead `isProcessed` prop
`WireListCommissionerPage.tsx:225, 339, 409, 446, 469, 472, 480` — `showRevert = isLocked && entry.outcome !== "PENDING" && !isProcessed` simplifies to `isLocked && entry.outcome !== "PENDING"` because `LOCKED` and `PROCESSED` are mutually exclusive period states. Drop the prop. ~6 LOC.

### 4. Unused default exports
- `processor.ts:654-655` exports both default and named — only named imported.
- `routes.ts:543-544` same pattern.

Drop default exports (per repo convention: named exports preferred, defaults only for page components).

### 5. `CANCELLED` enum value with no code path
`shared/api/wireList.ts:23` and Prisma enum declare `CANCELLED` `WaiverPeriodStatus`, but no code transitions a period into it. Either ship a cancel endpoint or drop the enum value. **Recommend drop** unless cancel is on the roadmap (requires DB migration).

### 6. Dead `priority` optional field
`shared/api/wireList.ts:71` (`CreateAddEntryBodySchema`) and `:99` (`CreateDropEntryBodySchema`) — `priority` is `.optional()` but no client passes it; server always computes via `nextAddPriority`. Drop the optional. ~4 LOC.

### 7. Ellipsis inconsistency
`processor.ts:351` uses `…` (Unicode ellipsis); rest of file uses `...` (ASCII). Standardize on ASCII. Cosmetic.

### 8. `useEffect` seeding default
`WireListCommissionerPage.tsx:373-381` seeds the default 7-days-out deadline in a `useEffect` with an `eslint-disable`. A `useState` initializer (lazy) is the natural shape and drops the suppression. ~6 LOC.

## Proposed Solutions

Land all 8 items as a single PR, gated by tsc + Wire List unit tests + a browser smoke pass on both pages. Each item is independently revertible if review pushback lands.

Suggested commit ordering inside the PR:
1. Items 2, 4, 6, 7 — pure deletions, no behavior risk.
2. Items 1, 3, 8 — small refactors, all client-only.
3. Item 5 — DB migration, separate commit so it can be reviewed in isolation.

## Acceptance Criteria

- [ ] `wireListErrMsg` (or `ApiError.displayCode()`) is the only error-string code path in both Wire List pages
- [ ] No re-exports of `WaiverPeriodStatus` / `WaiverDropMode` / `WaiverAddOutcome` / `WaiverDropStatus` in `client/src/features/wire-list/api.ts`
- [ ] `isProcessed` prop removed from commissioner page row component
- [ ] `processor.ts` and `routes.ts` export only named exports
- [ ] `CANCELLED` removed from `WaiverPeriodStatus` (Zod + Prisma) OR a cancel endpoint shipped — pick one
- [ ] `priority` removed from `CreateAddEntryBodySchema` and `CreateDropEntryBodySchema`
- [ ] No `…` Unicode ellipsis in `processor.ts`
- [ ] Default-deadline seed in `WireListCommissionerPage.tsx` uses `useState` initializer; `eslint-disable` removed
- [ ] tsc clean (CI is the authority — see `feedback_local_server_tsc_zod_false_negative.md`)
- [ ] Browser-verified on both `/teams/:code/wire-list` (owner) and `/commissioner/:leagueId/wire-list` (commissioner)

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Merged Wire List PRs: https://github.com/thirstypig/TheFantasticLeagues/pulls?q=wire-list+is%3Amerged
- `shared/api/wireList.ts`
- `client/src/features/wire-list/api.ts`
- `client/src/features/wire-list/pages/WireListCommissionerPage.tsx`
- `client/src/features/wire-list/pages/WireListOwnerPage.tsx`
- `server/src/features/wire-list/processor.ts`
- `server/src/features/wire-list/routes.ts`
- Related: todo #163 (design-preview deletion, P2 — separate scope)
