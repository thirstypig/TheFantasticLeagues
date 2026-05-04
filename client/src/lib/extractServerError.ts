/**
 * extractServerError — pull a user-facing message out of an unknown thrown
 * value, preferring (in order):
 *
 *   1. The structured `serverMessage` carried by `ApiError` (from
 *      `client/src/api/base.ts`) — set when the server returns a JSON body
 *      with `error` / `message` / `detail`.
 *   2. The error's `.message` for plain `Error` instances.
 *   3. A caller-supplied fallback string.
 *
 * Used by the RosterMoves panels (AddDrop, PlaceOnIl, ActivateFromIl) to
 * replace the duplicated `err?.serverMessage || err?.message || "fallback"`
 * shape that previously required typing every catch as `any`. Centralized so
 * the panels can type catches as `unknown` (proper) and stay narrow on the
 * extraction.
 *
 * Per todo #161 — kills the per-panel `as any` cast on each catch block.
 */
export function extractServerError(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const record = err as { serverMessage?: unknown; message?: unknown };
    if (typeof record.serverMessage === "string" && record.serverMessage.trim() !== "") {
      return record.serverMessage;
    }
    if (typeof record.message === "string" && record.message.trim() !== "") {
      return record.message;
    }
  }
  return fallback;
}
