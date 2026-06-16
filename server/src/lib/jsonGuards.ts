/**
 * Runtime guards for Prisma.JsonValue fields.
 *
 * Prisma types JSONB columns as `Prisma.JsonValue` (string | number | boolean |
 * null | JsonObject | JsonArray). These guards narrow to the specific shape each
 * feature expects, replacing bare `as` casts that suppress TypeScript's checks
 * without any runtime validation.
 */

/**
 * Narrows a `Prisma.JsonValue` to `Record<string, number>` — the shape stored
 * in `Player.posGames` (position abbreviation → games played).
 *
 * Returns false for null, strings, booleans, arrays, and objects that contain
 * non-finite numeric values (e.g. a manual fixup that wrote a string value).
 */
export function isPosGamesRecord(v: unknown): v is Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every(
    (val) => typeof val === "number" && Number.isFinite(val),
  );
}
