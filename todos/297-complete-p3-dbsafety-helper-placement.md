---
status: complete
priority: p3
issue_id: 297
tags: [code-review, architecture, testing, placement]
dependencies: [293]
---

## Problem Statement

`server/src/lib/dbSafety.ts` is a **test-only** guard (`isLocalThrowawayDbUrl`, used by `describe.skipIf`) but lives in `server/src/lib/`, which otherwise holds production runtime code (`ilWindows.ts`, `sportConfig.ts`, `prisma.ts`). This blurs the test-infra/runtime boundary, and nothing prevents production code from importing the helper and branching on it.

## Findings

- **File**: `server/src/lib/dbSafety.ts`.
- **Severity**: P3 — placement only; the function itself is pure, strict, and well-tested. Flagged by architecture-strategist.

## Proposed Solution

Move to a dedicated test-support location (e.g. `server/src/test-support/dbSafety.ts` or `server/test/helpers/`) and update the two importers (`draftIntegration.test.ts`, `dbSafety.test.ts`). Keep if the team prefers a flat `lib/` — low stakes.

- **Effort**: Small. **Risk**: Low (import path update only).
- **Dependency**: do after / together with #293 (the guard rewrite) to avoid churning the file twice.

## Recommended Action

(blank — triage)

## Acceptance Criteria

- [ ] `isLocalThrowawayDbUrl` lives in a test-support path (or explicit decision to keep in `lib/` documented).
- [ ] Importers updated; tests green.
- [ ] `git mv` this todo to complete.

## Work Log

- 2026-06-29: Filed from `/ce:review` (architecture-strategist P3). Bundle with #293.
- 2026-06-29: RESOLVED (PR fix/review-followups, with #293). Moved `dbSafety.ts` → `server/src/test-support/dbSafety.ts` and its test → `server/src/test-support/__tests__/dbSafety.test.ts`; updated the draft-suite import. The test-only guard no longer sits among runtime `lib/` code. tsc clean; tests green.
