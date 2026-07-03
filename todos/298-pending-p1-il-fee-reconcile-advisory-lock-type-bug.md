---
status: pending
priority: p1
issue_id: 298
tags: [outbox, il-fees, roster-rules, payouts, bug, postgres, advisory-lock]
dependencies: []
---

## Problem Statement
`OutboxEvent` rows id=1 (P2/period 36, stuck since 2026-06-03) and id=2 (P3/period 37, since 2026-06-08), both `kind=IL_FEE_RECONCILE`, `attempts=5` (retries exhausted), fail every attempt with Postgres `42883: function pg_advisory_xact_lock(integer, bigint) does not exist`. IL-fee reconciliation for two closed periods has **never run**. Money-adjacent (OGBA has entry fees + payouts). Found via the 2026-07-02 staleness audit — no stat audit could catch it. Full evidence: `docs/reports/pipeline-staleness-audit-2026-07-02.md` Finding 1.

## Proposed Solutions
Cast the advisory-lock args to a matching overload (`pg_advisory_xact_lock($1::int, $2::int)` or a single `bigint` key). BEFORE re-running: read the IL_FEE_RECONCILE handler, confirm idempotency, and determine whether P2/P3 IL fees were actually left unassessed (financial impact currently UNKNOWN). Do not reset `attempts`/re-enqueue until impact is understood.

## Acceptance Criteria
- Root-cause the exact lock call site; fix the type mismatch with a unit/integration test that would have caught 42883.
- Document (in the todo Resolution) whether P2/P3 fees were missing and what the corrective action was.
- Re-run reconcile for periods 36 & 37; verify `completedAt` set and fees correct; reverse nothing silently.
- `git mv` this todo from pending → complete.
