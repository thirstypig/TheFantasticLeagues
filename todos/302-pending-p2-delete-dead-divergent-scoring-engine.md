---
status: pending
priority: p2
issue_id: 302
tags: [dead-code, scoring, cleanup, risk-reduction]
dependencies: []
---

## Problem Statement
`server/src/services/scoringEngine.ts:234` exports a full H2H `calculateStandings()` (W/L/streak over `H2HMatchup`) with semantics completely different from the production roto path — and `H2HMatchup` has zero writers (returns empty). Zero importers today, but a second exported function named `calculateStandings` in a generic `services/` file is importable by mistake. Same file: dead `calculateNFLPoints`/`calculateNBACategories`/`compareNBACategories`. Evidence: `docs/reports/pipeline-staleness-audit-2026-07-02.md` Finding 5.

## Proposed Solutions
Delete the dead exports (keep only `getDefaultScoringRules`, the one live export). Confirm zero non-test importers first. Leave `scripts/audit_period.ts` (script-only) but add a header guard noting it is NOT production-faithful.

## Acceptance Criteria
- Dead `calculateStandings`/NFL/NBA exports removed; tests + tsc green; no runtime importer broken.
- `git mv` this todo from pending → complete.
