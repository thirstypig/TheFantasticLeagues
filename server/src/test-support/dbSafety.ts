/**
 * Database safety helpers for tests.
 *
 * Some integration tests run destructive, unscoped `deleteMany({})` against the
 * real Prisma singleton — they wipe every row in the tables they touch. They
 * must run ONLY against an explicit local throwaway Postgres, never CI, staging,
 * or prod. (Precedent: draftIntegration.test.ts; the local `.env` historically
 * pointed at prod, so an unguarded run would have erased the production league.)
 *
 * Lives under `test-support/` (not runtime `lib/`) because it is a test-only
 * guard — production code must never import or branch on it.
 */

/**
 * True only when `url`'s HOST is an explicit local loopback (localhost / 127.0.0.1
 * / ::1). Used to gate destructive DB-touching test suites — but pair it with an
 * explicit opt-in flag so the gate fails CLOSED (see draftIntegration.test.ts):
 *   describe.skipIf(!(isLocalThrowawayDbUrl(url) && process.env.ALLOW_DESTRUCTIVE_DB_TESTS === "1"))
 *
 * Parses the host via `new URL` rather than substring-matching. A substring
 * `.test(/@localhost/)` is bypassable — Postgres URLs can carry `@localhost`
 * inside the password or a query param while the real host is prod, e.g.
 *   postgresql://u:p@localhost:5432@db.prod.supabase.co/postgres
 *   postgresql://u:p@db.prod.supabase.co/postgres?application_name=x@localhost:1
 * `new URL().hostname` resolves the host after the LAST `@`, so both yield the
 * prod host → false. Empty/undefined/unparseable → false (CI has no DATABASE_URL).
 *
 * CAVEAT: host-based detection cannot see through a tunnel — `localhost:6543` may
 * be an SSH tunnel / `kubectl port-forward` to prod. The opt-in flag is the real
 * mitigation; "localhost ⇒ safe" is not absolute.
 */
export function isLocalThrowawayDbUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}
