-- todo #300 — make staleness queryable on the scoring tables.
--
-- Until now `PlayerStatsPeriod` / `TeamStatsPeriod` carried no write timestamp,
-- so "is this row stale?" was only answerable via expensive cross-referential
-- joins. That is the root reason the June 2026 boundary-freeze bug hid for
-- seven weeks.
--
-- DELIBERATELY NULLABLE, no backfill. `NOT NULL DEFAULT CURRENT_TIMESTAMP`
-- would stamp every historical row as "just synced", and the staleness alarm
-- built on this column would report a clean bill of health on day one — the
-- exact failure mode the column exists to detect. NULL means "not written
-- since this column landed": unknown, not fresh.
--
-- Plain CREATE INDEX, NOT CONCURRENTLY: Prisma wraps each migration in a
-- transaction, and CONCURRENTLY inside one fails with PG 25001, marks the
-- migration failed, and blocks every future Railway boot via P3009 (precedent:
-- 2026-05-05, prod frozen 21h). These tables are ~1.5k rows, so the brief
-- ACCESS EXCLUSIVE lock is negligible.

ALTER TABLE "PlayerStatsPeriod" ADD COLUMN "syncedAt" TIMESTAMP(3);
ALTER TABLE "TeamStatsPeriod" ADD COLUMN "syncedAt" TIMESTAMP(3);

CREATE INDEX "PlayerStatsPeriod_syncedAt_idx" ON "PlayerStatsPeriod"("syncedAt");
