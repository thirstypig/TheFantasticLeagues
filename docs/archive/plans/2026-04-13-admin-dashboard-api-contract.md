# Admin Dashboard + Errors — API Contract

**Status:** Authoritative spec for two parallel agents (server + client).  
**Owner:** @jimmy  
**Date:** 2026-04-13  
**Scope:** Endpoints needed for the admin command-center dashboard rebuild.

Both server and client implementations MUST conform to this contract exactly. If the server finds a better shape during implementation, update this doc and notify the client agent; do not silently diverge.

---

## Conventions

- All endpoints live under `/api/admin/*` and require `requireAdmin` middleware.
- All responses are JSON with `Content-Type: application/json`.
- All dates are ISO 8601 strings (`toISOString()`).
- Error responses use the standard error envelope: `{ error: string, requestId: string, detail?: string }` (where `detail` is populated only for admin users per Phase 1 error work).
- Pagination: `?page=1&pageSize=50` (omit to get defaults). Responses include `{ total, page, pageSize }`.

---

## 1. `GET /api/admin/stats`

**Purpose:** Drives the top of the admin dashboard — the 4 stat cards, the activity feed, and the todo/errors summaries.

### Response

```ts
interface AdminStatsResponse {
  users: {
    total: number;                    // count of User rows
    active30d: number;                // distinct userId in AuditLog.createdAt in last 30d
    newThisMonth: number;             // User.createdAt >= start of current calendar month
    paid: number;                     // stub 0 until Stripe lands; schema-ready
  };
  leagues: {
    total: number;                    // count of League rows
    byStatus: {                       // SeasonStatus breakdown, from current Season per league
      setup: number;
      draft: number;
      inSeason: number;
      completed: number;
    };
  };
  aiInsights: {
    total: number;                    // count of AiInsight rows
    generatedThisWeek: number;        // createdAt >= start of week (Monday)
    latestWeekKey: string | null;     // most recent weekKey, e.g. "2026-W15"
  };
  todos: {
    total: number;                    // sum across all categories in todo-tasks.json
    notStarted: number;
    inProgress: number;
    done: number;
    topActive: Array<{                // top 5 active (not_started or in_progress) by priority
      id: string;
      title: string;
      status: "not_started" | "in_progress";
      priority: "p0" | "p1" | "p2" | "p3";
      categoryTitle: string;
    }>;
  };
  recentActivity: Array<{             // last 20 AuditLog rows, newest first
    id: number;
    userId: number;
    userName: string | null;          // join User.name (null if user deleted)
    userEmail: string | null;
    action: string;                   // e.g. "TRADE_PROCESS", "AUCTION_INIT"
    resourceType: string;
    resourceId: string | null;
    createdAt: string;                // ISO
  }>;
  recentErrors: Array<AdminErrorRecord>;  // last 5 errors from ring buffer (see §2)
  generatedAt: string;                // ISO — when the server computed this
}
```

### Implementation notes (server)

- Cache this response in-memory for 10 seconds to avoid hammering Postgres on repeated admin loads. Invalidate on writes to AuditLog is NOT required — eventual consistency is fine for a dashboard.
- `users.active30d` proxy: `SELECT COUNT(DISTINCT "userId") FROM "AuditLog" WHERE "createdAt" > now() - interval '30 days'`. Replace with real session data once the session-tracking migration lands.
- `leagues.byStatus` — you'll need to join to the current `Season` per league. If there are leagues with no Season, bucket them as `setup`.
- `todos.topActive` sort order: P0 first, then P1, then P2, then P3; within priority, `in_progress` before `not_started`.
- `recentActivity` — do a single JOIN: `AuditLog LEFT JOIN User ON AuditLog.userId = User.id ORDER BY createdAt DESC LIMIT 20`.

---

## 2. `GET /api/admin/errors`

**Purpose:** Drives the "Recent Errors" panel on the dashboard + a future dedicated errors page.

### Response

```ts
interface AdminErrorRecord {
  ref: string;                        // e.g. "ERR-a3f7b291" — user-facing code
  requestId: string;                  // the internal id (prefix-less) for log grep
  message: string;                    // error.message or String(err)
  stack: string | null;               // error.stack (can be large; truncate to 4096 chars)
  path: string;                       // req.path
  method: string;                     // req.method
  userId: number | null;              // req.user?.id ?? null
  userEmail: string | null;           // denormalized for display without join
  statusCode: number;                 // HTTP status returned to client (usually 500)
  timestamp: string;                  // ISO when the error was caught
}

interface AdminErrorsListResponse {
  errors: AdminErrorRecord[];         // newest first, bounded to 100
  bufferSize: number;                 // current count, for observability
  bufferCapacity: number;             // 100
}
```

Query params: none for now. Future: `?since=ISO`.

### Implementation notes (server)

- Ring buffer: module-level `AdminErrorRecord[]` in a new file `server/src/lib/errorBuffer.ts` with `push(record)`, `list()`, `find(ref)` helpers.
- `push` maintains max 100 entries — `unshift(record); if (length > 100) pop()`.
- `ref` format: `ERR-${req.requestId}` — always derive from the existing request ID, never generate a separate one.
- `stack` truncation: `.slice(0, 4096)` to avoid buffer bloat on long stack traces.
- **Do NOT persist to disk or Postgres.** Ring buffer is intentionally ephemeral — surface for live debugging, not compliance. Restart wipes it. Good.
- Write the error handler patch in `server/src/index.ts` so any 500 gets captured. Do not remove the existing `logger.error` call — logs are still the source of truth for compliance.

---

## 3. `GET /api/admin/errors/:ref`

**Purpose:** Lookup a single error by code. Useful when a user DMs a code from a toast — admin pastes it into the URL.

### Response

```ts
interface AdminErrorLookupResponse {
  error: AdminErrorRecord | null;     // null if not found in ring buffer
  note?: string;                      // e.g. "Not found in ring buffer — may have been evicted. Check Railway logs for requestId."
}
```

### Status codes
- `200` with `{ error: AdminErrorRecord }` if found
- `200` with `{ error: null, note: "…" }` if not found (NOT 404 — the endpoint works, the ref just isn't in buffer)

### Implementation notes

- Accept both `ERR-a3f7b291` and `a3f7b291` as input — strip the prefix before lookup.
- No rate limit beyond the standard admin bucket.

---

## 4. Error Handler Patch — admin-only `detail`

Currently `server/src/index.ts:325-335` returns `{ error: "Internal Server Error", requestId }`. Patch:

```ts
app.use((err: unknown, req, res, _next) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const ref = `ERR-${req.requestId}`;

  // 1. Log (unchanged + add ref)
  logger.error({ error: message, stack, ref, path: req.path, method: req.method, requestId: req.requestId, userId: req.user?.id }, "Unhandled error");

  // 2. Push to ring buffer (NEW)
  errorBuffer.push({
    ref,
    requestId: req.requestId,
    message,
    stack: stack?.slice(0, 4096) ?? null,
    path: req.path,
    method: req.method,
    userId: req.user?.id ?? null,
    userEmail: req.user?.email ?? null,
    statusCode: 500,
    timestamp: new Date().toISOString(),
  });

  // 3. Response — admins get the actual message, everyone else gets the generic text
  const body: { error: string; requestId: string; ref: string; detail?: string } = {
    error: "Internal Server Error",
    requestId: req.requestId,
    ref,
  };
  if (req.user?.isAdmin) {
    body.detail = message;
  }
  res.status(500).json(body);
});
```

**Client `ApiError` update** (Phase 1 follow-up): the client's `fetchJsonApi` already reads `requestId` from the response. Extend to also read `ref` and `detail`, expose on `ApiError`. Surface `detail` in the `ErrorToast` (already shows `serverMessage`).

---

## 5. Tests (server agent must include)

- `server/src/features/admin/__tests__/adminStats.test.ts` — GET /api/admin/stats returns well-formed shape; non-admin gets 403; admin users get all sections populated against a seeded DB
- `server/src/features/admin/__tests__/adminErrors.test.ts` — ring buffer push/list/find; prefix normalization; non-admin gets 403; list is newest-first; bounded to 100
- `server/src/__tests__/integration/errorHandler.test.ts` — throwing in a handler populates the buffer; admin response contains `detail`; non-admin response does not

---

## 6. Versioning

This is v1. If either agent finds this shape wrong (e.g., Prisma query can't produce a field efficiently), update this doc with the correction *before* diverging. The client can stub missing fields with `undefined` in the meantime.
