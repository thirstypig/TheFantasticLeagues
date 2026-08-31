// server/src/lib/outboxHealth.ts
//
// End-state checks for the outbox, rather than trust in the event that was
// supposed to have been enqueued.
//
// Two failures on 2026-08-31 shared that shape:
//
//  - **Period 4 was never enqueued.** The only IL_FEE_RECONCILE enqueue site is
//    `PATCH /api/periods/:id`, gated on `req.body.status === "completed"`.
//    Closing a period any other way — a direct DB write, which is how OGBA
//    rollovers are sometimes performed — skips it silently, and $50 went
//    unbilled for weeks with nothing to notice.
//  - **Rows 1 and 2 exhausted their retries.** The drainer selects
//    `attempts < MAX_ATTEMPTS`, so an event at the ceiling is invisible to it
//    forever: no retry, no alert, no reset path. They still read as failed
//    today even though the fees were eventually billed by hand.
//
// Both are answered by asking the database what is true now, not by trusting
// that a transition was observed. Pure — the caller owns all I/O.

/**
 * Completed periods with no SUCCESSFUL reconcile event.
 *
 * "Successful" is the key word: an event that exists but never completed
 * (exhausted, or still failing) leaves the period just as unbilled as no event
 * at all. Counting mere existence is what made rows 1 and 2 look handled.
 *
 * Safe to act on indiscriminately — reconcile is idempotent, and a period that
 * genuinely owes nothing simply reports `added: 0`.
 */
export function findPeriodsMissingReconcile(
  periods: { id: number; status: string }[],
  events: { payload: { periodIds?: number[] }; completedAt: Date | null }[],
): number[] {
  const covered = new Set<number>();
  for (const e of events) {
    if (e.completedAt === null || e.completedAt === undefined) continue;
    for (const pid of e.payload?.periodIds ?? []) covered.add(pid);
  }
  return periods
    .filter((p) => p.status === "completed" && !covered.has(p.id))
    .map((p) => p.id)
    .sort((a, b) => a - b);
}

/**
 * Events the drainer will never pick up again: at or past the attempt ceiling
 * and still not completed.
 *
 * `>=` not `===` on purpose — a ceiling that was lowered, or a row incremented
 * twice by a race, must not slip past the check that exists to catch it.
 */
export function findExhaustedEvents<
  T extends { id: number; attempts: number; completedAt: Date | null; kind: string },
>(events: T[], maxAttempts: number): T[] {
  return events.filter(
    (e) => (e.completedAt === null || e.completedAt === undefined) && e.attempts >= maxAttempts,
  );
}
