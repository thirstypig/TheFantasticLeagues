/**
 * Centralized advisory-lock keys for cron jobs.
 *
 * Each integer must be unique within the Postgres advisory-lock namespace
 * (per-database). Audit collisions before adding a new entry.
 *
 * Sourced from `server/src/index.ts` cron schedulers.
 */
export const ADVISORY_LOCKS = {
  /** Hourly session-purge cron — sessions feature. */
  sessionPurge: 0x53455353, // "SESS"
  /** Every-5-min wire-list auto-lock cron. Used with pg_try_advisory_xact_lock. */
  wireListAutoLock: 0x57495245, // "WIRE"
  /** Daily user-metrics rollup purge. */
  userMetricsPurge: 0x50555247, // "PURG"
} as const;

export type AdvisoryLockKey = keyof typeof ADVISORY_LOCKS;
