---
status: complete
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

## Resolution (2026-07-03)
Deleted from `server/src/services/scoringEngine.ts`: `calculateStandings` (H2H over the never-written `H2HMatchup` table), `calculateNFLPoints`, `calculateNBACategories`, `compareNBACategories`, and the 3 interfaces only they used (`NBACategory`, `NBAMatchupComparison`, `StandingsRow`) + now-unused imports (`PrismaClient`, `ScoringRule`, `prisma`). Kept `getDefaultScoringRules` (+ `ScoringRuleInput`) — the one live export (used by `features/scoring/routes.ts`). Verified zero non-test importers of the deleted symbols first. tsc clean; full server suite green (1347). PR on `chore/delete-dead-scoring-engine-302`.
Note: the `audit_period.ts` header-guard sub-item is deferred — it's a separate script not touched here.
