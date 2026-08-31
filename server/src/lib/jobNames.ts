// server/src/lib/jobNames.ts
//
// Job identifiers and their freshness expectations (todo #299).
//
// Kept in one place because the name is a JOIN KEY between the JobRun rows a
// cron writes and the dead-man's-switch that reads them. A typo on either side
// silently disables the alarm for that job — the failure mode this whole todo
// exists to eliminate — so neither side may spell a name inline.

export const JOB_STATS_SYNC = "stats-sync";
export const JOB_PLAYER_SYNC = "player-sync";
export const JOB_CATEGORY_SNAPSHOT = "category-snapshot";
export const JOB_RECONCILE = "stats-reconcile";
export const JOB_DAILY_STATS = "daily-stats";
export const JOB_AAA_PROSPECTS = "aaa-prospects";
export const JOB_CLOSED_PERIOD_AUDIT = "closed-period-audit";

import type { JobExpectation } from "./jobHealth.js";

/**
 * Alert when a job has had no SUCCESSFUL run inside its window.
 *
 * Windows are deliberately ~2× the schedule interval, so one skipped run or a
 * transient MLB outage does not page anyone, but a genuinely dead job does.
 */
export const JOB_EXPECTATIONS: JobExpectation[] = [
  // Runs 4×/day (13:00, 18:00, 22:00, 02:00 UTC) — 12h means ~2 missed runs.
  { job: JOB_STATS_SYNC, maxAgeHours: 12 },
  // Runs daily at 12:00 UTC.
  { job: JOB_PLAYER_SYNC, maxAgeHours: 36 },
  // Daily at 11:00 UTC.
  { job: JOB_CATEGORY_SNAPSHOT, maxAgeHours: 36 },
  // Daily at 14:00 UTC.
  { job: JOB_RECONCILE, maxAgeHours: 36 },
  // Daily at 13:30 UTC.
  { job: JOB_DAILY_STATS, maxAgeHours: 36 },
  // Weekly, Monday 14:00 UTC — 9 days tolerates one missed week minus slack.
  { job: JOB_AAA_PROSPECTS, maxAgeHours: 9 * 24 },
  // Nightly at 03:20 UTC.
  { job: JOB_CLOSED_PERIOD_AUDIT, maxAgeHours: 36 },
];
