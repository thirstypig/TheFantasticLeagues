/**
 * Database safety helpers for tests.
 *
 * Some integration tests run destructive, unscoped `deleteMany({})` against the
 * real Prisma singleton — they wipe every row in the tables they touch. They
 * must run ONLY against an explicit local throwaway Postgres, never CI, staging,
 * or prod. (Precedent: draftIntegration.test.ts; the local `.env` historically
 * pointed at prod, so an unguarded run would have erased the production league.)
 */

/**
 * True only when `url` points at an explicit local Postgres (localhost or
 * 127.0.0.1). Used to gate destructive DB-touching test suites:
 * `describe.skipIf(!isLocalThrowawayDbUrl(process.env.DATABASE_URL))`.
 *
 * Keep this STRICT. Widening the match (e.g. to a hosted Supabase host) re-arms
 * the prod-wipe risk. Empty/undefined → false, so CI (no DATABASE_URL) skips.
 */
export function isLocalThrowawayDbUrl(url: string | undefined | null): boolean {
  return /@(localhost|127\.0\.0\.1)[:/]/.test(url ?? "");
}
