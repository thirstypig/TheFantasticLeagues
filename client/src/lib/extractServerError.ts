/**
 * extractServerError — pull a user-facing message out of an unknown thrown
 * value, preferring (in order):
 *
 *   1. A `ZodError`-shaped client-side validation throw — gets a distinct
 *      "Client validation failed" prefix so it's never silently relabeled as
 *      a server-side rules failure (PR #308 follow-up).
 *   2. The structured `serverMessage` carried by `ApiError` (from
 *      `client/src/api/base.ts`) — set when the server returns a JSON body
 *      with `error` / `message` / `detail`.
 *   3. The error's `.message` for plain `Error` instances.
 *   4. A caller-supplied fallback string.
 *
 * Used by the RosterMoves panels (AddDrop, PlaceOnIl, ActivateFromIl) to
 * replace the duplicated `err?.serverMessage || err?.message || "fallback"`
 * shape that previously required typing every catch as `any`. Centralized so
 * the panels can type catches as `unknown` (proper) and stay narrow on the
 * extraction.
 *
 * Per todo #161 — kills the per-panel `as any` cast on each catch block.
 */

interface ZodIssueLike {
  path?: Array<string | number>;
  message?: string;
}

interface ZodErrorLike {
  name: string;
  issues?: ZodIssueLike[];
}

/**
 * Duck-typed ZodError detector. Avoids `instanceof ZodError` so the check
 * survives bundling situations where multiple zod versions resolve into the
 * same client (the same shape that bit `mcp-servers/fbst-app` in PR #296).
 */
function isZodLikeError(err: unknown): err is ZodErrorLike {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; issues?: unknown };
  return e.name === "ZodError" && Array.isArray(e.issues);
}

export function extractServerError(err: unknown, fallback: string): string {
  // Client-side schema-validation throws (from `Schema.parse(params)` in
  // `client/src/features/transactions/api.ts`, PR #308) get a distinct
  // prefix so they're not silently relabeled as server-side rule failures.
  // A schema mismatch is a *bug* in the caller, not a "rules not satisfied"
  // condition the user can resolve by changing input.
  if (isZodLikeError(err)) {
    const first = err.issues?.[0];
    const path = first?.path?.join(".") ?? "";
    const reason = first?.message ?? "invalid input";
    return path
      ? `Client validation failed at "${path}": ${reason}. This is a bug — please report.`
      : `Client validation failed: ${reason}. This is a bug — please report.`;
  }
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
