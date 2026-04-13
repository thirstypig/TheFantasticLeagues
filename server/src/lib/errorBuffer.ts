/**
 * Ring buffer for captured 500-error records, surfaced via /api/admin/errors.
 *
 * Intentionally ephemeral — restart wipes it. The structured `logger` (stdout)
 * remains the source of truth for compliance/log-aggregation; this buffer
 * exists only so an admin can pull recent errors out of a live dashboard.
 *
 * Capacity is bounded to 100 entries. Newest entries are at index 0.
 */

export interface AdminErrorRecord {
  /** User-facing ref code, always `ERR-${requestId}`. */
  ref: string;
  /** Internal request id (prefix-less) for log grep. */
  requestId: string;
  /** `error.message` or `String(err)`. */
  message: string;
  /** `error.stack`, truncated to 4096 chars. Null if not an Error. */
  stack: string | null;
  /** `req.path` at the time of the error. */
  path: string;
  /** HTTP method. */
  method: string;
  /** `req.user?.id` or null. */
  userId: number | null;
  /** Denormalized `req.user?.email` so the errors table renders without a join. */
  userEmail: string | null;
  /** HTTP status returned to the client (almost always 500). */
  statusCode: number;
  /** ISO string for when the error was captured. */
  timestamp: string;
}

const CAPACITY = 100;

// Module-level ring buffer. Newest-first (index 0 = most recent).
const buffer: AdminErrorRecord[] = [];

/**
 * Push a new error record. Newest entries go to the front.
 * When the buffer exceeds CAPACITY, the oldest entry is evicted.
 */
export function push(record: AdminErrorRecord): void {
  buffer.unshift(record);
  if (buffer.length > CAPACITY) {
    buffer.pop();
  }
}

/**
 * Returns a shallow copy of the buffer, newest-first.
 * Shallow copy so callers can't mutate internal state.
 */
export function list(): AdminErrorRecord[] {
  return buffer.slice();
}

/**
 * Look up an error by ref. Accepts either the `ERR-abc123` form
 * or the bare `abc123` form — both resolve to the same entry.
 */
export function find(ref: string): AdminErrorRecord | null {
  if (!ref) return null;
  const normalized = ref.startsWith("ERR-") ? ref : `ERR-${ref}`;
  return buffer.find((r) => r.ref === normalized) ?? null;
}

/** Test-only helper. */
export function clear(): void {
  buffer.length = 0;
}

/** Ring buffer capacity (exported for tests / response shape). */
export const BUFFER_CAPACITY = CAPACITY;
