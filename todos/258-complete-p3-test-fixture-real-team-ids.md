---
status: pending
priority: p3
issue_id: 258
tags: [code-review, test-coverage, standings, fixtures]
dependencies: []
---

## Problem Statement

`standingsService.differential.test.ts` uses real production team IDs (`teamId: 145`, `148`) and real team names ("RGing Sluggers", "Demolition Lumber Co.") in mock fixtures. All DB calls are fully mocked so there is no runtime data leakage, but this violates the project's test fixture authenticity policy (memory: `feedback_test_fixtures.md`): mocks must mirror real API shapes without anchoring to production IDs. If tests are ever captured in CI artifacts visible externally, team composition becomes readable.

## Findings

From security-sentinel:
- `standingsService.differential.test.ts` lines 73–75, 84, 143, 192, 270: `teamId: 145`, `teamId: 148`, names "RGing Sluggers" / "Demolition Lumber Co."
- All Prisma calls are mocked — no production DB access at risk
- Policy precedent: `feedback_test_fixtures.md` documents that fabricated fields can mask production bugs; using real IDs but fictional shapes is the acceptable middle ground

## Proposed Solutions

**Option A — Replace with synthetic team IDs and neutral names**

Change `teamId: 145 → 1001`, `teamId: 148 → 1002`, names → `"Alpha"` / `"Bravo"` (or similar). The test references teams by `code` for assertions (`r.team.code === "RGS"`), so update codes to `"AAA"` / `"BBB"` as well.

Effort: Tiny | Risk: None

## Technical Details

Affected files:
- `server/src/features/standings/__tests__/standingsService.differential.test.ts` — 6 occurrences

## Acceptance Criteria

- [ ] No real team IDs (145, 148) in test fixtures
- [ ] No real team names ("RGing Sluggers", "Demolition Lumber Co.") in test fixtures
- [ ] All assertions still pass with synthetic IDs
- [ ] Team codes used in `r.team.code === "..."` assertions updated consistently

## Work Log

2026-06-04 — Surfaced by security-sentinel. Violates test fixture authenticity policy from memory.
