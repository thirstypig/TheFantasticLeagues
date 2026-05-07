---
status: pending
priority: p2
issue_id: "165"
tags: [code-review, wire-list, security, audit]
dependencies: []
---

# Wire List: audit log fire-and-forget defeats forensic certainty post-incident

## Problem Statement

Every `writeAuditLog({...})` call in the wire-list feature is unawaited. If logging throws (DB hiccup, schema drift, transient pool exhaustion), the response still returns 200/201 with no audit record. For a commissioner-driven mutation surface that touches roster ownership, this defeats the entire point of the audit trail — we cannot reconstruct the sequence of actions during an incident.

The `/finalize` handler is the most critical: roster mutations have already committed by the time the audit log call runs, so a swallowed audit failure means a permanent gap in the record of who finalized what.

## Findings

Unawaited `writeAuditLog(...)` calls in wire-list:
- `server/src/features/wire-list/routes.ts` — multiple sites for create/reorder/delete
- `server/src/features/wire-list/processor.ts:119-124` (`/lock`)
- `server/src/features/wire-list/processor.ts:315-321` (`/finalize` — POST-COMMIT)
- `server/src/features/wire-list/processor.ts:483-489` (`/succeed`)
- `server/src/features/wire-list/processor.ts:517-523` (`/fail`)
- `server/src/features/wire-list/processor.ts:550-556` (`/skip`)
- `server/src/features/wire-list/processor.ts:597-603` (`/revert`)

Pattern across all sites: no `await`, no `.catch()`, no fallback persistence path.

## Proposed Solutions

### Option 1: Await audit-log on all reducer endpoints (recommended)
Add `await` to all wire-list `writeAuditLog` calls. Failure surfaces as a 500 to the caller, but the mutation has already committed — caller must retry idempotently or accept the audit gap as a logged 500 (with `requestId`).

**Effort:** Trivial (~15min). **Risk:** Low — DB writes for audit are cheap; pool exhaustion is the only realistic failure mode and that's already a wider incident.

### Option 2: Await + dual-write to errorBuffer on failure
Same as Option 1 but `.catch(err => errorBuffer.push({...}))` so audit gaps are visible in the admin error dashboard.

**Effort:** Small (~30min). **Risk:** Low. **Preferred** if we want zero-loss visibility.

### Option 3: Move audit-log into the same Prisma transaction as the mutation
Strongest guarantee (atomicity), highest risk — extending transaction scope can cause lock contention. Defer.

**Effort:** Medium. **Risk:** Medium-high.

## Recommended Action

**Option 2** for `/finalize` (highest stakes), **Option 1** for the rest. `/finalize` deserves errorBuffer visibility because the mutation is irreversible.

## Technical Details

- Files: `server/src/features/wire-list/processor.ts`, `server/src/features/wire-list/routes.ts`
- Helper exists: `server/src/lib/errorBuffer.ts` (push)
- No schema changes

## Acceptance Criteria

- [ ] All wire-list `writeAuditLog` calls are awaited
- [ ] `/finalize` audit-log failure is captured in `errorBuffer` with `requestId`
- [ ] Tests assert audit-log calls happen on success path
- [ ] Tests assert that injected audit-log failure on `/finalize` surfaces in errorBuffer

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- `server/src/lib/auditLog.ts`
- `server/src/lib/errorBuffer.ts`
- `server/src/features/wire-list/processor.ts:315-321` (highest-stakes site)
