// server/src/lib/jobHealth.ts
//
// Ingestion job health (todo #299).
//
// Every scheduled job in `index.ts` was `try/catch → logger.error → continue`,
// with no persisted record of a successful run anywhere in the schema. The only
// alert path was `lib/errorBuffer.ts` — an in-memory 100-entry ring wiped on
// every restart. Silent failure therefore looked identical to success, which is
// how todo #298 hid for ~30 days and how Period 4's IL-fee enqueue went missing
// with nobody noticing.
//
// Pure on purpose: the caller owns persistence, so the decisions are
// unit-testable with no database.

export interface JobRunRecord {
  job: string;
  finishedAt: Date | null;
  ok: boolean;
  rowsWritten?: number | null;
}

export interface JobExpectation {
  job: string;
  /** Alert if there has been no SUCCESSFUL run within this many hours. */
  maxAgeHours: number;
}

export interface StaleJob {
  job: string;
  lastSuccessAt: Date | null;
  hoursSince: number | null;
  reason: "never-run" | "overdue";
}

/**
 * Decide whether a completed run actually succeeded.
 *
 * `expectsRows` encodes the rule the todo asks for: a sync that writes **zero**
 * rows is a FAILURE, not a "complete". `syncAllActivePeriods` returned void and
 * logged success even when the MLB circuit breaker was open and nothing was
 * written — the silent-zero case. Jobs that can legitimately do nothing (a
 * reconciler finding no drift) pass `expectsRows: false`.
 */
export function classifyRun(args: {
  error: unknown;
  rowsWritten: number;
  expectsRows: boolean;
}): { ok: boolean; error: string | null } {
  if (args.error !== null && args.error !== undefined) {
    const msg = args.error instanceof Error ? args.error.message : String(args.error);
    return { ok: false, error: msg };
  }
  if (args.expectsRows && args.rowsWritten === 0) {
    return { ok: false, error: "wrote 0 rows — treated as failure (job expects rows)" };
  }
  return { ok: true, error: null };
}

/**
 * Dead-man's switch: which expected jobs have no recent **successful** run?
 *
 * Keyed on success, never on mere execution — a job failing every five minutes
 * has run very recently and is still completely broken. That distinction is the
 * entire point; "it ran" is not "it worked".
 */
export function findStaleJobs(
  runs: JobRunRecord[],
  expectations: JobExpectation[],
  now: Date,
): StaleJob[] {
  const lastSuccess = new Map<string, Date>();
  for (const r of runs) {
    if (!r.ok || r.finishedAt == null) continue;
    const prev = lastSuccess.get(r.job);
    if (!prev || r.finishedAt.getTime() > prev.getTime()) lastSuccess.set(r.job, r.finishedAt);
  }

  const stale: StaleJob[] = [];
  for (const exp of expectations) {
    const last = lastSuccess.get(exp.job);
    if (!last) {
      stale.push({ job: exp.job, lastSuccessAt: null, hoursSince: null, reason: "never-run" });
      continue;
    }
    const hoursSince = (now.getTime() - last.getTime()) / 3600_000;
    if (hoursSince > exp.maxAgeHours) {
      stale.push({ job: exp.job, lastSuccessAt: last, hoursSince, reason: "overdue" });
    }
  }
  return stale;
}
