-- todo #299 — persist every scheduled-job execution.
--
-- Before this there was no "last successful run" anywhere in the schema, and the
-- only alert channel was lib/errorBuffer.ts: an in-memory 100-entry ring wiped on
-- every restart. A silently dead cron was therefore indistinguishable from a
-- healthy one — which is how todo #298 hid for ~30 days.
--
-- New table only: no ALTER on an existing table, so nothing can lock or break a
-- running deploy. Plain CREATE INDEX (never CONCURRENTLY inside a Prisma
-- migration — PG 25001 → failed migration → P3009 blocks all future boots;
-- precedent 2026-05-05).

CREATE TABLE "JobRun" (
    "id" SERIAL NOT NULL,
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "rowsWritten" INTEGER,
    "error" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- Serves the dead-man's-switch query: latest successful run per job.
CREATE INDEX "JobRun_job_finishedAt_idx" ON "JobRun"("job", "finishedAt");
