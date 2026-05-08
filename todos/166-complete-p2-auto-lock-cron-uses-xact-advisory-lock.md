---
status: pending
priority: p2
issue_id: "166"
tags: [code-review, wire-list, security, advisory-lock]
dependencies: []
---

# Wire List auto-lock cron: session-scoped advisory lock is pgBouncer-unsafe

## Problem Statement

The auto-lock cron (every 5 min) uses `pg_try_advisory_lock(0x57495245)` — a **session-scoped** advisory lock — to coordinate across multiple Railway instances. Combined with Prisma's connection pool and Supabase's pgBouncer (per project memory `supabase_railway_connection_setup.md`), the unlock call may run on a *different* pooled connection than the lock acquisition, making the unlock a no-op. The lock then sits orphaned until the original pooled connection is recycled.

`connection_limit=1` mitigates the worst case but transaction-pool mode can still rebind statements within a "session" to different backends. The correct primitive for transaction-bounded work is `pg_try_advisory_xact_lock`, which auto-releases on commit/rollback regardless of which backend services the call.

## Findings

`server/src/index.ts:361-384` — cron handler:

```ts
const [{ locked }] = await prisma.$queryRaw<{ locked: boolean }[]>`
  SELECT pg_try_advisory_lock(0x57495245) AS locked
`;
if (!locked) return;
try {
  await runAutoLock();
} finally {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(0x57495245)`;
}
```

Issue: lock and unlock are not in the same `$transaction`. With pgBouncer transaction pooling, the unlock can land on a different backend connection than the lock — silently failing.

## Proposed Solutions

### Option 1: Switch to `pg_try_advisory_xact_lock` inside `$transaction` (recommended)

```ts
await prisma.$transaction(async (tx) => {
  const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_xact_lock(0x57495245) AS locked
  `;
  if (!locked) return;
  await runAutoLock(tx);
});
```

Lock auto-releases on commit/rollback; pooler-safe.

**Effort:** Small (~1h). **Risk:** Low — `runAutoLock` must accept a transaction client; if it currently uses the global `prisma`, refactor to pass `tx` through.

### Option 2: Use a row-level lock on a sentinel table
`SELECT ... FOR UPDATE NOWAIT` on a dedicated `cron_lease(name)` row. Heavier-weight; equally pooler-safe.

**Effort:** Small-medium. **Risk:** Low.

### Option 3: Tolerate occasional double-runs
Make `runAutoLock` idempotent and drop the advisory lock entirely. Acceptable if `runAutoLock` is cheap and idempotent — but the function does writes (period status flip), so concurrent runs could double-emit push notifications.

**Effort:** Trivial. **Risk:** Medium — push spam under contention.

## Recommended Action

**Option 1** — minimum diff, correct primitive, idiomatic Prisma.

## Technical Details

- File: `server/src/index.ts:361-384`
- May require `runAutoLock(tx?: Prisma.TransactionClient)` signature change
- Lock key `0x57495245` ("WIRE" in ASCII) preserved
- No schema changes
- Per memory `supabase_railway_connection_setup.md` — DATABASE_URL/DIRECT_URL both use pooler

## Acceptance Criteria

- [ ] Auto-lock uses `pg_try_advisory_xact_lock` inside `prisma.$transaction`
- [ ] Manually verifying: kill the connection mid-cron leaves no lock held (xact lock auto-released)
- [ ] Multi-instance test: two Railway dynos competing for the same period flip exactly once
- [ ] Tests cover the locking primitive switch

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Project memory: `supabase_railway_connection_setup.md`
- Postgres docs: advisory locks — https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
- File: `server/src/index.ts:361-384`
