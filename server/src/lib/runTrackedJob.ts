// server/src/lib/runTrackedJob.ts
//
// The wrapper every scheduled job goes through (todo #299).
//
// Persists a JobRun row on BOTH success and failure, so "did this job run, and
// did it work?" becomes a database question instead of a guess. Pairs with
// lib/jobHealth.ts, which reads those rows for the dead-man's switch.

import { prisma } from "../db/prisma.js";
import { logger } from "./logger.js";
import { classifyRun } from "./jobHealth.js";

export interface JobRunStore {
  create(data: { job: string; startedAt: Date }): Promise<{ id: number }>;
  finish(
    id: number,
    data: { finishedAt: Date; ok: boolean; rowsWritten: number | null; error: string | null },
  ): Promise<void>;
}

const prismaStore: JobRunStore = {
  async create(data) {
    const row = await prisma.jobRun.create({ data, select: { id: true } });
    return { id: row.id };
  },
  async finish(id, data) {
    await prisma.jobRun.update({ where: { id }, data });
  },
};

let store: JobRunStore = prismaStore;

/** Test seam. Production always uses the Prisma-backed store. */
export function __setJobRunStore(s: JobRunStore): void {
  store = s;
}

/**
 * Run a scheduled job, recording the attempt and its outcome.
 *
 * Two guarantees the cron callers depend on:
 *
 * 1. **Never rethrows.** A throwing cron callback can take the process down;
 *    the failure is recorded and swallowed, exactly as the old inline
 *    try/catch blocks did — except now it leaves a durable trace.
 * 2. **Tracking failure never breaks the job.** If the JobRun write itself
 *    fails (DB down), the wrapped work still runs. Observability must not
 *    become a new outage source.
 *
 * `expectsRows: true` makes a zero-row run a FAILURE — the silent-zero case
 * from `syncAllActivePeriods`, which logged "complete" while the MLB circuit
 * breaker was open and nothing was written.
 */
export async function runTrackedJob<T extends { rowsWritten: number }>(
  job: string,
  fn: () => Promise<T>,
  opts: { expectsRows: boolean },
): Promise<T | null> {
  const startedAt = new Date();

  let runId: number | null = null;
  try {
    runId = (await store.create({ job, startedAt })).id;
  } catch (err) {
    logger.error({ job, error: String(err) }, "runTrackedJob: could not record job start");
  }

  let result: T | null = null;
  let thrown: unknown = null;
  try {
    result = await fn();
  } catch (err) {
    thrown = err;
  }

  const rowsWritten = result?.rowsWritten ?? 0;
  const { ok, error } = classifyRun({ error: thrown, rowsWritten, expectsRows: opts.expectsRows });

  if (runId !== null) {
    try {
      await store.finish(runId, { finishedAt: new Date(), ok, rowsWritten, error });
    } catch (err) {
      logger.error({ job, error: String(err) }, "runTrackedJob: could not record job finish");
    }
  }

  if (ok) logger.info({ job, rowsWritten }, "job complete");
  else logger.error({ job, rowsWritten, error }, "job FAILED");

  return result;
}
