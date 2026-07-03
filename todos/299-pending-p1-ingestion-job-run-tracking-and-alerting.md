---
status: pending
priority: p1
issue_id: 299
tags: [ingestion, cron, observability, alerting, reliability, outbox]
dependencies: []
---

## Problem Statement
Every scheduled ingestion job (`server/src/index.ts`) is `try/catch → logger.error → continue`. There is no persisted "last successful run" anywhere in the schema, and the only alert path (`server/src/lib/errorBuffer.ts`) is an in-memory 100-entry buffer wiped on restart. The 4×/day period-stats sync (`mlbStatsSyncService.ts:221`) returns `void` and logs "complete" even when 0 rows were written (MLB circuit breaker open). Silent failures = stale data with no signal; this is why todo #298 hid ~30 days. Evidence: `docs/reports/pipeline-staleness-audit-2026-07-02.md` Finding 2.

## Proposed Solutions
Add a `JobRun` table (job, startedAt, finishedAt, ok, rowsWritten, error) written by every cron wrapper. Add a real alert (Resend email / webhook) fired on job failure AND on "no successful run of job X in N hours" (dead-man's-switch). Stop discarding `syncAllActivePeriods`'s result — inspect and log rows-written.

## Acceptance Criteria
- Every ingestion cron records a JobRun row (success and failure).
- A failed sync (or a stalled outbox / a "no run in N hours") sends a durable alert that survives restart.
- Period-stats sync surfaces rows-written; 0-rows during a window is treated as failure, not "complete".
- `git mv` this todo from pending → complete.
