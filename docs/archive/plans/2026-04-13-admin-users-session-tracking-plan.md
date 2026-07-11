# Admin Users + Session Tracking — Implementation Plan

**Status:** **Revised** (deepen-plan 2026-04-13) — awaiting approval to run migration  
**Owner:** @jimmy  
**Requested:** 2026-04-13  
**Revised:** 2026-04-13 after 4-agent review (see Appendices A–D)  
**Route scaffold:** `/admin/users` (empty-state, rendering planned columns)  
**Related:** Launch readiness analysis (session 2026-04-12), Competitive gaps (Session 56)

---

## Revisions Summary (deepen-plan 2026-04-13)

Four parallel agent reviews (security, performance, data-integrity, best-practices) surfaced the following material changes. Each is reflected in the updated sections below; full reviews are in the appendices.

### Design changes (MUST adopt)

| # | Change | Source | Reason |
|---|---|---|---|
| R1 | **Remove `User.createdAt` migration step** — field already exists at schema.prisma:139 | Data-Integrity | No-op |
| R2 | **`UserSession.id: Int` not `String cuid()`** + optional `token String @unique` for client-visible opaque ID | Data-Integrity | Match FBST convention (every model uses Int PK) |
| R3 | **One session per browser, not per tab** — BroadcastChannel + shared sessionId in sessionStorage | Best-Practices | Matches Mixpanel/PostHog; prevents 4× inflated totalSessions |
| R4 | **Heartbeat cadence 60s → 30s** + server dedupe (skip if `lastSeenAt` within 25s) | Best-Practices | Halves undercount error; <1ms Postgres op |
| R5 | **No per-heartbeat `totalSecondsOnSite` increment.** Compute `durationSec` on session-end; nightly reconcile `UserMetrics.totalSecondsOnSite = SUM(UserSession.durationSec)` | Data-Integrity + Performance | Eliminates RMW race and "closed laptop = 8hr" drift |
| R6 | **Do NOT index `UserSession.lastSeenAt`** — preserves HOT updates, avoids dead-tuple bloat. Set `fillfactor = 80` on table | Performance | Critical: indexed lastSeenAt breaks HOT → ~100MB/day bloat at 1k DAU |
| R7 | **`fetch({ keepalive: true })` replaces `sendBeacon`** on pagehide — sendBeacon cannot send Authorization header | Security + Performance + Best-Practices | sendBeacon breaks Bearer auth model |
| R8 | **Hash + truncate IP** — store HMAC-SHA256(ip, IP_HASH_SECRET); retain full raw IP only 7 days for fraud investigation; truncate to `/24` after | Security + Best-Practices | GDPR/CCPA 2025 data-minimization; defensible under legitimate interest |
| R9 | **Heartbeat rate limit: 20/min per userId** (was 120/min). Hard cap 10 concurrent sessions per user | Security | Prevents metric inflation and concurrent-session abuse |
| R10 | **Denormalize `leaguesOwnedCount` + `leaguesCommissionedCount` into `UserMetrics`** — maintain on league create/delete/role-change | Performance | Admin query 800ms → <50ms at 10k users |
| R11 | **Upsert semantics for `UserMetrics` first-login** — `prisma.userMetrics.upsert({...})`, never findUnique+create | Data-Integrity | Race-safe under tab-open thundering herd |
| R12 | **Single idempotent UPDATE for idle sweeper** — `WHERE endedAt IS NULL AND lastSeenAt < now() - interval '30 min'`. Add `pg_try_advisory_lock` for multi-instance safety | Data-Integrity | No SELECT-then-UPDATE race |
| R13 | **Impersonation moves from P1 to P0** — must ship with dual-identity JWT (RFC 8693 actor claim), sticky red banner, AdminAuditLog rows on start/end, 30-min TTL, no writes during impersonation by default, email notification to real user. Feature-flag if not ready | Security + Best-Practices | OWASP ASVS V2; Stripe/Intercom pattern |
| R14 | **Default admin table sort `lastSeenAt DESC`** (not signupAt); chip filters above table, side-drawer for detail, 44px rows | Best-Practices | Stripe/Linear/PostHog convention |
| R15 | **PostHog is complementary, not replacement** — keep Prisma `UserSession` + `UserMetrics` as source of truth for admin UI; add `posthog-js` init separately for funnels/retention/replay. `person_profiles: 'identified_only'` to save cost | Best-Practices | PostHog event pricing bends wrong at 5k+ DAU; admin page needs joins to local tables |
| R16 | **`UserDeletionLog` (non-cascading, indefinite retention)** with hashed email — written *before* cascade delete | Security + Data-Integrity | Preserves audit trail after GDPR erasure |
| R17 | **Log `LOGIN` action to existing `AuditLog`** in addition to creating `UserSession` — permanent trail that outlives 90-day session purge | Data-Integrity | Separation of concerns (audit vs. engagement) |
| R18 | **Retention purge uses `LIMIT 10000` loop** with alert if > 50k rows deleted per run (signals cron was down) | Data-Integrity | Stampede protection + observability |
| R19 | **Backfill `lastActivityAt` (not `lastLoginAt`)** by scanning `AuditLog.createdAt` MAX per user — label correctly in UI until real session data accrues | Data-Integrity | AuditLog tracks writes, not logins |

### Architectural clarifications (from agent conflicts resolved)

- **Performance Oracle proposed splitting into `UserPresence` + `UserSessionArchive`** (hot-write single row + archive). **Data-Integrity Guardian kept `UserSession` as single model.** Resolution: the `UserSession`-single-model pattern works IF we (a) treat one session as "one row per browser, spans tabs via BroadcastChannel" (R3), (b) do not index `lastSeenAt` (R6), (c) compute duration on end not per heartbeat (R5). This achieves performance's goals (HOT updates, no bloat) with data-integrity's simpler model. Adopted.
- **Best-Practices proposed server-inferred sessions from request logs as alternative.** Resolution: keep heartbeat as primary (accuracy during quiet reading), add lightweight `RequestEvent` as backup signal *only if* heartbeat coverage proves unreliable in production — defer as post-launch observability.

### Decision points requiring your sign-off

1. **Accept R13 (impersonation as P0)?** Adds ~2 days of work to the PR. Alternative: ship behind a feature flag disabled in prod until Jimmy personally approves each use. Recommend the flag + disabled-in-prod approach.
2. **Accept R8 (hash IP + 7-day raw retention)?** Requires new env `IP_HASH_SECRET`, privacy-page copy update, and one-time key rotation doc. Alternative: store raw IP for full 90 days with stronger access controls. Recommend the hash approach.
3. **Accept R15 (add PostHog init in same PR)?** Or ship session tracking first, PostHog in a follow-up PR? Recommend follow-up PR to keep blast radius small.

---

## Why

The app has no visibility into user engagement. We cannot answer:
- Who is actually using the product vs. signed up and dormant?
- How long is an average session?
- Which commissioners logged in today / this week?
- Who is at risk of churn before they cancel?

This matters operationally (support, retention) and as launch readiness — we cannot defend a paid tier without activity data.

---

## Scope

One new admin page at `/admin/users` plus the data pipeline to feed it.

### Out of scope for this change
- Subscriptions / Stripe LTV column — lands with Stripe integration (tracked separately)
- Impersonation / suspend / delete actions — P1 follow-up after the table ships
- Cohort analytics, funnels — PostHog owns that once wired up
- Email-based outreach tooling — separate project

---

## Data Model (REVISED)

### New: `UserSession` — one row per browser, not per tab

```prisma
model UserSession {
  id           Int      @id @default(autoincrement())   // R2: Int convention
  token        String   @unique @default(cuid())         // R2: opaque client-visible
  userId       Int
  ipHash       String?                                   // R8: HMAC(raw, IP_HASH_SECRET)
  ipTruncated  String?                                   // R8: /24 kept after 7d
  ipRaw        String?                                   // R8: raw, purged at 7d
  userAgent    String?  @db.Text
  country      String?
  startedAt    DateTime @default(now())
  lastSeenAt   DateTime @default(now())
  endedAt      DateTime?
  durationSec  Int?
  endReason    String?                                   // "logout" | "idle" | "sweeper"

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, startedAt])
  // R6: deliberately NO index on lastSeenAt — preserves HOT updates
}
```

Set `fillfactor = 80` + aggressive autovacuum in the migration (raw SQL):
```sql
ALTER TABLE "UserSession" SET (
  fillfactor = 80,
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_cost_limit = 1000
);
```

### New: `UserMetrics` — denormalized rollup, one row per user

```prisma
model UserMetrics {
  userId                    Int      @id
  totalLogins               Int      @default(0)
  totalSessions             Int      @default(0)
  totalSecondsOnSite        Int      @default(0)   // R5: rolled up on session end, not heartbeat
  avgSessionSec             Int      @default(0)
  leaguesOwnedCount         Int      @default(0)   // R10: denormalized
  leaguesCommissionedCount  Int      @default(0)   // R10: denormalized
  firstSeenAt               DateTime
  lastSeenAt                DateTime
  lastLoginAt               DateTime?
  lastActivityAt            DateTime?              // R19: backfilled from AuditLog
  signupSource              String?
  signupUtmSource           String?
  signupUtmCampaign         String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([lastSeenAt(sort: Desc)])  // admin default sort (R14)
  @@index([lastLoginAt(sort: Desc)])
}
```

### New: `UserDeletionLog` (R16) — survives cascade, indefinite retention

```prisma
model UserDeletionLog {
  id          Int      @id @default(autoincrement())
  userId      Int                        // original user id, not FK (no cascade)
  emailHash   String                     // HMAC(email, IP_HASH_SECRET)
  deletedAt   DateTime @default(now())
  deletedBy   Int?                       // admin id if admin-initiated, null if self-delete
  reason      String?                    // free-form
  metadata    Json?
}
```

### `User` model — no changes required

R1 confirmed: `createdAt` already exists at `prisma/schema.prisma:139`. Skip that step.

### Migration safety notes
- Three new tables all start empty; no data backfill concerns beyond the opportunistic `lastActivityAt` backfill (R19)
- All FKs use `onDelete: Cascade` except `UserDeletionLog` (R16) which intentionally breaks the chain
- One raw SQL block required (fillfactor + autovacuum on UserSession)

---

## Capture Flow (REVISED)

Three hook points from client → server. All incorporate the revisions above.

### 1. On login (once per browser, coordinated across tabs)
- **Client:** `AuthProvider` checks shared `sessionStorage` for an existing `fbst:sessionToken`. If present and recent (<5 min since last heartbeat on any tab), reuse it. Otherwise fires `POST /api/sessions/start`.
  - Coordination via `BroadcastChannel('fbst-session')` — first tab creates the session, other tabs subscribe
  - Shared `sessionToken` is stored in `sessionStorage` (NOT `localStorage` — R8 isolation concern)
- **Server:**
  - Ownership: validates `req.user.id` via `requireAuth` (Supabase JWT)
  - Creates `UserSession` (uses Int PK internally, returns opaque `token` to client)
  - `upsert` on `UserMetrics` with `totalLogins: { increment: 1 }`, `totalSessions: { increment: 1 }`, `lastLoginAt: now`, `lastSeenAt: now` (R11)
  - Writes `AuditLog { action: "LOGIN", userId, resourceType: "User", resourceId: userId }` (R17)
  - **Concurrent-session cap** (R9): if user has ≥10 open sessions, close the oldest in the same transaction
  - **Credential-stuffing canary**: if user has >100 sessions created in the last hour, emit `logger.warn` and reject new sessions for that user for 15 min
- **Response:** `204 No Content` with `Set-Cookie` OR JSON body `{ token }` — token is all the client gets

### 2. Heartbeat (every 30s while tab visible — R4)
- **Client:** top-level `useSessionHeartbeat()` hook mounted in `AuthProvider`
  - Fires `POST /api/sessions/heartbeat` with `{ token }` every 30s when `document.visibilityState === "visible"`
  - Debounced: only one tab fires heartbeats at a time (BroadcastChannel leader election)
  - Uses `fetch({ keepalive: true })` — never `sendBeacon` (R7)
- **Server:**
  - Validates `token` maps to `UserSession` where `userId === req.user.id` (R ownership check)
  - Returns `204 No Content` on both success AND ownership mismatch (avoid enumeration)
  - Server dedupe: if `lastSeenAt` is within the last 25s, return 204 without writing (R4)
  - Otherwise: single `UPDATE UserSession SET lastSeenAt = now() WHERE id = $1 AND userId = $2`
  - **No `UserMetrics` write on heartbeat** (R5) — keeps hot path cheap; duration rolls up on session end only
  - Rate limit: 20/min per userId (R9)

### 3. End (explicit logout, tab hidden > 30 min, or sweeper)
- **Client — explicit logout:** `AuthProvider.logout` issues `POST /api/sessions/end` + clears shared `sessionStorage`
- **Client — tab hidden:** on `visibilitychange → hidden`, if this is the last visible tab (BroadcastChannel coordination), fire `POST /api/sessions/end` via `fetch({ keepalive: true })` (R7). Note: sendBeacon cannot send `Authorization: Bearer` so we cannot use it.
- **Server end handler:**
  - Validates ownership, sets `endedAt = now()`, computes `durationSec = endedAt - startedAt`, sets `endReason = "logout" | "idle"`
  - **Rolls up to `UserMetrics`** here (R5):
    ```sql
    UPDATE "UserMetrics"
    SET "totalSecondsOnSite" = "totalSecondsOnSite" + LEAST($durationSec, 28800),
        "avgSessionSec" = ("totalSecondsOnSite" + LEAST($durationSec, 28800)) / NULLIF("totalSessions", 0),
        "lastSeenAt" = GREATEST("lastSeenAt", $endedAt)
    WHERE "userId" = $userId;
    ```
    (The `LEAST($durationSec, 28800)` clamps to 8 hours — defense against absurdly long sessions from broken sweeper.)

### 4. Idle sweeper (cron, every 15 min) — R12

Single idempotent statement, safe under concurrent live heartbeats:

```sql
-- Acquire advisory lock for multi-instance safety
SELECT pg_try_advisory_lock(hashtext('user_session_sweeper'));

-- Idempotent close: live heartbeats bump lastSeenAt out of the WHERE predicate
UPDATE "UserSession"
SET "endedAt" = "lastSeenAt",
    "durationSec" = EXTRACT(EPOCH FROM ("lastSeenAt" - "startedAt"))::int,
    "endReason" = 'sweeper'
WHERE "endedAt" IS NULL
  AND "lastSeenAt" < now() - interval '30 minutes';

-- Then roll up to UserMetrics in the same transaction
```

### 5. Retention purge (cron, nightly) — R18

```sql
-- Purge raw IP at 7 days
UPDATE "UserSession" SET "ipRaw" = NULL WHERE "startedAt" < now() - interval '7 days' AND "ipRaw" IS NOT NULL;

-- Purge full session rows at 90 days (batched)
DELETE FROM "UserSession"
USING (
  SELECT id FROM "UserSession" WHERE "startedAt" < now() - interval '90 days' LIMIT 10000
) stale
WHERE "UserSession".id = stale.id;
-- Loop until deleted count = 0. Alert if total deleted > 50k (signals cron downtime).
```

### Why this shape (vs. original plan)
- **Accurate engaged-time** (30s resolution vs. 60s undercount)
- **Multi-tab safe** (one session per browser, no inflation)
- **No heartbeat races** (no per-heartbeat rollup)
- **Postgres HOT updates** (no `lastSeenAt` index → no dead-tuple bloat)
- **No auth gap on end** (fetch keepalive carries Bearer)
- **GDPR-defensible** (hashed IP, 7-day raw retention, indefinite deletion log)

---

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/sessions/start` | requireAuth | Create `UserSession`, bump `UserMetrics` |
| POST | `/api/sessions/heartbeat` | requireAuth | Update `lastSeenAt` |
| POST | `/api/sessions/end` | requireAuth | Close session, finalize duration |
| GET  | `/api/admin/users` | requireAdmin | Paginated user list with joined metrics |
| GET  | `/api/admin/users/:id` | requireAdmin | Detail view + recent sessions |
| POST | `/api/admin/users/:id/impersonate` | requireAdmin | Mint a short-lived token (P1 follow-up) |
| POST | `/api/admin/users/:id/suspend` | requireAdmin | Set `User.isSuspended` (P1 follow-up) |
| DELETE | `/api/admin/users/:id` | requireAdmin | Cascade-delete via Prisma (P1 follow-up) |

### Rate limiting
- Heartbeat hits a per-user bucket at 120/min (safe — should be ~1/min)
- Admin endpoints use the existing admin limiter

### Validation
- All three session endpoints use `validateBody` with Zod schemas
- `ipAddress` is never trusted from client — read from `req.ip` after `trust proxy` (already set)
- `country` read from `req.headers["cf-ipcountry"]` (Cloudflare sets this)

---

## `GET /api/admin/users` — response shape

```ts
interface AdminUsersResponse {
  users: Array<{
    id: number;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    isAdmin: boolean;
    signupAt: string;
    lastLoginAt: string | null;
    totalLogins: number;
    totalSessions: number;
    totalSecondsOnSite: number;
    avgSessionSec: number;
    leaguesOwned: number;         // COUNT(Team WHERE ownerId = user.id)
    leaguesCommissioned: number;  // COUNT(LeagueMembership role=COMMISSIONER)
    tier: "free" | "pro" | "commissioner" | "unknown";
    signupSource: string | null;
    country: string | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
}
```

### Query params
- `page` (default 1), `pageSize` (default 50, max 200)
- `search` — matches email OR name, case-insensitive
- `sort` — one of: `email`, `signupAt`, `lastLoginAt`, `totalSessions`, `totalSecondsOnSite`
- `dir` — `asc` | `desc` (default `desc`)
- `tier` — filter to `free` | `pro` | `commissioner`
- `active` — `today` | `7d` | `30d` | `dormant` (dormant = no login in 30d)

### Query plan
- Single query joining `User` + `UserMetrics` (LEFT JOIN — new users have no metrics row yet)
- Two subqueries for `leaguesOwned` / `leaguesCommissioned` aggregates
- Pagination via OFFSET/LIMIT — adequate for sub-10k users; revisit keyset pagination at 50k

---

## Privacy & Retention

- **PII stored:** email (already in `User`), IP address, user-agent string, coarse country. No precise location.
- **Retention:** `UserSession` rows auto-purged at 90 days via nightly cron. `UserMetrics` aggregates are kept forever (non-PII rollups).
- **Right to erasure:** `onDelete: Cascade` on both models. `DELETE /api/me/account` (part of launch readiness P0) wipes everything.
- **Disclosure:** `/privacy` page must call out: IP logging, session heartbeats, retention window.
- **Access:** `UserSession.ipAddress` and `userAgent` are admin-only; not exposed in any non-admin endpoint.

---

## Frontend Wiring

1. **`useSessionHeartbeat` hook** at `client/src/hooks/useSessionHeartbeat.ts`
   - Mounted in `AuthProvider` so it runs for every authed page
   - Uses `useEffect` with `setInterval(60_000)`
   - Listens to `visibilitychange` events to pause/resume
   - Flushes on `pagehide` via `navigator.sendBeacon`

2. **`AuthProvider`** kicks off session on login and ends on logout

3. **`AdminUsers` page** (already scaffolded) swaps the empty-state for the real fetch:
   ```ts
   fetchJsonApi<AdminUsersResponse>(`${API_BASE}/admin/users?${params}`)
   ```

4. **Impersonate button** (P1): hits `/api/admin/users/:id/impersonate`, receives short-lived token, stores in sessionStorage + banner "Impersonating user@example.com [End]"

---

## Tests

### Server (new)
- `server/src/features/admin/__tests__/sessions.test.ts` — start/heartbeat/end flow, idle sweeper
- `server/src/features/admin/__tests__/adminUsers.test.ts` — filtering, sorting, pagination, auth gates
- Integration: login → heartbeat → logout full cycle; verify UserMetrics rollup accuracy

### Client (new)
- `client/src/hooks/__tests__/useSessionHeartbeat.test.ts` — visibility change pause, interval, cleanup
- `client/src/features/admin/__tests__/AdminUsers.test.tsx` — renders table, sort, filter, admin gate

---

## Rollout

1. Merge migration + endpoints + heartbeat hook in one PR behind zero user impact (heartbeat is silent for existing users; nothing changes visually)
2. Let it run 24h → verify `UserSession` and `UserMetrics` populate cleanly
3. Wire the real fetch into `AdminUsers` page → ship
4. One week later, evaluate query performance; add composite indexes if needed
5. Add P1 follow-ups (impersonate, suspend, delete) in a separate PR

---

## Open Questions — RESOLVED by deepen-plan

| # | Original question | Resolution |
|---|---|---|
| 1 | Session timeout — 30 min tab-hidden or no-heartbeat? | **Both** — idle sweeper closes sessions with `lastSeenAt < now - 30min`. Live heartbeats naturally exclude themselves from the sweep predicate. |
| 2 | Multi-tab — per-tab or per-browser? | **Per-browser** (R3). BroadcastChannel coordinates tabs to share one sessionToken. Matches Mixpanel/PostHog. |
| 3 | Bot traffic — scrape-worthy endpoint? | Rate limit 20/min/userId (R9); server returns 204 on both success and mismatch (no data exposed). Safe. |
| 4 | Country from IP vs Cloudflare? | Cloudflare `CF-IPCountry` header preferred (free, already proxied). Fall back to Maxmind lookup of hashed IP only for fraud investigations. |
| 5 | Historical backfill? | Opportunistic backfill of `lastActivityAt` from `AuditLog.MAX(createdAt)` per user (R19). Labeled distinctly from `lastLoginAt` until real session data accrues. |

### New questions to confirm before shipping

1. **Impersonation gating (R13):** ship with the dual-JWT + red-banner design behind a feature flag disabled in prod, or defer the endpoint entirely? Recommend flag + disabled.
2. **Hash secret rotation cadence (R8):** yearly is industry standard but breaks historical IP correlation. OK with yearly? Or longer?
3. **`UserSession.endReason` values:** `"logout"` | `"idle"` | `"sweeper"` — add `"session_cap"` when closing oldest per R9 concurrent-session cap?

---

## Approval Checklist (REVISED)

When you (Jimmy) are ready to greenlight, confirm each:

- [ ] Accept the 19 revisions (R1–R19) above — or flag specific ones to skip
- [ ] Resolve the 3 decision points in the Revisions Summary
- [ ] Three new Prisma models OK (`UserSession`, `UserMetrics`, `UserDeletionLog`) — no changes to existing `User`
- [ ] Raw SQL in the migration (`ALTER TABLE SET fillfactor`, partial-index adjustments) is acceptable
- [ ] Retention: raw IP 7d, full session 90d, UserMetrics forever — acceptable
- [ ] Privacy page will be updated to disclose IP hashing + session heartbeat + retention windows before migration runs
- [ ] New env vars: `IP_HASH_SECRET` (required for migration), `SESSION_CAP_PER_USER=10` (optional override)
- [ ] OK to run `prisma migrate dev --name add_user_session_tracking` locally first, verify with the integration test suite, then `prisma migrate deploy`
- [ ] Impersonation behind feature flag — not enabled in prod at migration time

Say "run it" and I'll:
1. Write the migration (three models + raw SQL tuning)
2. Implement the endpoints with ownership checks, rate limits, concurrent-session cap, 204-on-mismatch
3. Implement the client hook with BroadcastChannel coordination, 30s cadence, fetch-keepalive end
4. Wire the `AuditLog { action: "LOGIN" }` + `UserDeletionLog` pieces
5. Backfill `lastActivityAt` from AuditLog
6. Swap `/admin/users` scaffold for real data with the revised default sort
7. Write integration tests covering R1–R19
8. Update CLAUDE.md conventions section + FEEDBACK.md

---

---

# Appendices — Full agent reviews

The following four sections are the verbatim outputs of the parallel deepen-plan agents. Preserved in full for traceability; decisions above reference them by R-number.

## Appendix A — Security Review (security-sentinel)

### 1. Session Fixation / Hijacking (P1)
The `UserSession.id` cuid is a tracking identifier, not an auth credential — the real auth boundary is the Supabase JWT verified by `requireAuth`. That said, the plan allows any authed user to POST any `sessionId` to `/heartbeat`, which lets user A extend user B's session row. Mitigations:
- **Bind sessionId to userId server-side.** On every heartbeat/end, verify `UserSession.userId === req.user.id`; reject with 404 (not 403 — avoid confirming existence) otherwise.
- **Do not treat sessionId as a secret.** It is for correlation only; all trust flows from the Supabase JWT.
- **Rotate on privilege change.** If the user gains admin or switches franchise, start a new `UserSession` row so audit timelines are unambiguous.
- HMAC is unnecessary given JWT auth; skip it to keep the design simple.

### 2. Heartbeat Abuse / Enumeration (P1)
Without the ownership check above, an attacker could spray random cuids to inflate or corrupt victims' metrics. Even with it:
- **Return 204 No Content** on both success and "not your session" to prevent enumeration. Never echo session data.
- **Idempotent update only** — heartbeat must *only* bump `lastSeenAt`; never trust client-supplied duration/country/UA on heartbeat.
- **Cap per-user writes** — see §5. Log `logger.warn` on >2× expected rate.
- Never log raw sessionIds at info level (they leak through log sinks).

### 3. Impersonation Endpoint (P0)
This is the highest-risk surface in the plan. Required design:
- **Separate token type.** Mint a short-lived (≤15 min) signed JWT with claim `act: adminUserId` (RFC 8693 actor claim) *plus* `sub: targetUserId`. Never reuse the admin's own Supabase session.
- **Read-only by default.** `requireAuth` must detect `act` and block all non-GET verbs unless the endpoint is explicitly allow-listed. Writes during impersonation must be rejected with 403 or require a second confirmation flow.
- **Persistent audit row** — new `AdminAuditLog` table (actor, target, action, timestamp, ip, reason) written *before* token is minted; on every impersonated request, append the request line with `act` claim.
- **Visible banner + server-sent header** `X-Impersonation: true` so the client cannot hide it.
- **No nested impersonation.** Reject if `req.user.act` is already set.
- **Revocation list.** Store token jti; allow admin to end impersonation instantly.
- **Never impersonate another admin** without a second admin's approval.

### 4. PII / Retention (P1)
- **Raw IP is PII under GDPR.** Store a keyed HMAC-SHA256 hash (key in env `IP_HASH_SECRET`, rotated yearly) alongside a truncated form (`/24` for IPv4, `/48` for IPv6) for geolocation debugging. Keep raw IP only if legally required for fraud — 90 days is the ceiling, 30 days is safer.
- **90-day retention is defensible** but document the legal basis (legitimate interest for abuse prevention). Add a DSAR export endpoint.
- **Do not store sessionId in `localStorage`.** Use `sessionStorage` (scoped to tab, cleared on close) or an in-memory ref — `localStorage` is XSS-readable and persists across tabs/windows defeating the one-per-tab model.
- **Never send sessionId to third-party analytics** (PostHog, Sentry). Add a denylist in any analytics wrapper.
- **User-Agent**: truncate to 256 chars to avoid log-inflation and parse server-side; don't reflect UA in any response.

### 5. Rate Limiting (P2)
120/min per user is far too permissive for a 1/min heartbeat. Concrete limits:
- `/sessions/heartbeat`: **20/min per userId** (not per IP — NAT'd users share). 10 tabs × 1/min = 10, leaves headroom.
- `/sessions/start`: **10/min per userId** (login bursts on OAuth retries).
- `/sessions/end`: **30/min per userId** (pagehide + explicit logout overlap fine).
- Key limiter on `userId` from JWT, fall back to IP for unauthed hits. Pre-auth layer should still hold 300/min global.
- Multi-tab: each tab's sessionId is distinct, so aggregate across tabs. Enforce a **hard cap of 10 concurrent open sessions per userId** — the 11th `start` call closes the oldest.

### 6. Admin Users Endpoint (P1)
- `requireAdmin` is necessary but not sufficient for viewing PII. Add an **`AdminAuditLog` write on every `GET /admin/users/:id`** (actor, target, timestamp) — required for SOC2 and for GDPR "who accessed my data" requests.
- **Redact IP by default** — show country + hashed IP in list view; require a second click (`?reveal=true`) that writes an audit row to expose the `/24` truncated IP. Full raw IP should require a break-glass flag.
- **Search query logs** must not log the search term if it contains an email fragment — hash it.
- **Pagination**: enforce `pageSize ≤ 200` server-side (Zod `.max(200)`); otherwise an admin export can be used to exfiltrate the whole user table if credentials leak.

### 7. `navigator.sendBeacon` on pagehide (P2)
- **Auth header is not supported by `sendBeacon`** — it only sends `Content-Type` and cookies. Since FBST uses Bearer tokens (not cookies), the end-call cannot carry auth. Either (a) switch end-signal to `fetch` with `keepalive: true` (supports headers), or (b) accept that the sweeper will close these sessions within 15 min. Recommend (a).
- Payload size: `sendBeacon` drops silently if >64KB; fine for this use case.
- CORS: sendBeacon is a simple request — no preflight, but the server still enforces Origin on the route.

### 8. Sweeper / Deploy Gaps (P2)
- **Idempotent sweep**: `WHERE endedAt IS NULL AND lastSeenAt < now()-interval '30 min'` is safe to re-run; no lock needed. Missed windows self-heal on next tick.
- **Invariant check** for orphaned rows: nightly job counts `UserSession` with `startedAt < now()-24h AND endedAt IS NULL` — alert if >0. Also add a DB CHECK constraint or app assertion: `endedAt IS NULL OR endedAt >= startedAt`.
- **Avoid cron overlap during deploys** by using `SELECT ... FOR UPDATE SKIP LOCKED` on the sweep batch (Postgres), or a Redis lock keyed by sweep-window.

### 9. Concurrent Sessions Cap (P1)
One malicious user opening 500 tabs = 500 rows/min of writes. Enforce:
- Hard cap **10 open sessions per userId**; on `start`, if count ≥ 10, close the oldest in the same transaction.
- Reject new sessions if user has > 100 sessions created in the last hour (credential-stuffing canary → alert security).

### 10. Deletion & Audit Trails (P1)
- `onDelete: Cascade` is correct for GDPR but **destroys audit evidence**. Add a `UserDeletionLog` row (userId, email-hash, deletedAt, deletedBy, reason) written *before* the cascade — non-cascading, retained indefinitely.
- Distinguish **user-initiated deletion** (full wipe) from **admin suspension** (soft delete: `isSuspended=true`, sessions preserved for fraud review).
- `UserMetrics` rollups should be zeroed/removed on erasure — currently they cascade, which is correct, but confirm no denormalized copies live in `AiInsight.data` or chat messages. Grep for `userId` JSON fields before shipping.

### Priority Summary
- **P0**: Impersonation design (§3).
- **P1**: Ownership check on heartbeat (§1, §2), IP hashing + storage scope (§4), rate limits + concurrent cap (§5, §9), admin-access audit log (§6), deletion audit trail (§10).
- **P2**: `sendBeacon` auth gap (§7), sweeper invariants (§8).

---

## Appendix B — Performance Review (performance-oracle)

### TL;DR
The plan is workable at **100 users** but has three issues that bite hard at **1k+**: (1) heartbeat write amplification on `UserSession` with an index on `lastSeenAt`, (2) a non-atomic read-modify-write on `totalSecondsOnSite`, and (3) N+1 subquery aggregates on admin list. Fix these and the design holds to ~10k DAU on current infra.

### 1. Heartbeat write load (17 w/s @ 1k concurrent, 170 w/s @ 10k)
Postgres on Supabase Pro handles 17 w/s trivially. Pool saturation is the real risk at 10k with any concurrent admin query. Recommendation: upsert-in-place on a single row per user (`INSERT … ON CONFLICT (userId) DO UPDATE`). HOT updates fire if no indexed column changes.

### 2. Incremental seconds-on-site — atomic SQL only
The plan's `totalSecondsOnSite += (now - lastSeenAt)` in JS is a read-modify-write race. Two tabs = double-count. Fix with SQL-only atomic increment + `LEAST(delta, 120)` clamp.

### 3. `GET /api/admin/users` query cost
LEFT JOIN + 2 correlated subqueries for league counts is O(users × leagues). At 10k users × 2 leagues: 300-800ms. Denormalize league counts into `UserMetrics`. Always paginate.

### 4. Index strategy
Drop `@@index([startedAt])` alone; rarely queried in isolation. Keep composite `[userId, startedAt]`. **Do NOT index `UserPresence.lastSeenAt`** — kills HOT updates, ~3× table bloat/week at 1k.

### 5. Heartbeat batching — server-side only
Keep 60s client cadence. Batch server-side via in-memory Map + 5s flush interval. Cuts 170 w/s → 1 batched write/5s.

### 6. `sendBeacon` on pagehide
Does NOT send custom headers → cannot attach `Authorization: Bearer`. Use `fetch({ keepalive: true })` or same-origin cookie session.

### 7. Idle sweeper
At 10k open rows the `UPDATE WHERE lastSeenAt < now() - 15min` is <100ms. Batch in 1000-row chunks to avoid long locks.

### 8. `fmtRelative` — negligible
<1ms per row. Don't memoize.

### 9. VACUUM / dead tuples
17/s heartbeat UPDATEs = 1.5M dead tuples/day @ 1k users. Autovacuum defaults OK if HOT fires. Set:
```sql
ALTER TABLE "UserPresence" SET (
  fillfactor = 80,
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_cost_limit = 1000
);
```
If you index `lastSeenAt`, HOT breaks, bloat explodes (~100MB/day @ 1k). Confirmed killer at 10k.

### 10. Cost analysis
Supabase Pro: $25/mo base. Delta at 1k DAU: ~$0.50/mo. At 10k DAU: ~$4/mo. Redis overkill until 50k+.

### Scale breakpoints
| Issue | 100 | 1k | 10k |
|---|---|---|---|
| Heartbeat writes | fine | fine | fine w/ batching |
| Race on totalSeconds | breaks | breaks | breaks |
| Admin query | fine | 200ms | 800ms+ |
| Index bloat | fine | critical if indexed | fatal if indexed |
| Cost | $0 | $0.50/mo | $4/mo |

Priority: (1) atomic SQL increment, (2) denormalize league counts, (3) upsert-in-place pattern, (4) fillfactor + autovacuum tuning, (5) sendBeacon auth fix, (6) write-behind batching.

---

## Appendix C — Data Integrity Review (data-integrity-guardian)

### 1. `User.createdAt` — already exists
Confirmed at `prisma/schema.prisma:139`: `createdAt DateTime @default(now())`. The plan's "add field" step is a **no-op**.

### 2. Cascade delete — mostly trustworthy, one gap
`User.id` is referenced by 12 models — all `Cascade` except `Team.ownerUserId` (`SetNull`, correct). No `Restrict` relations → delete always succeeds. Separate concern: `ChatMessage.content` may quote user content elsewhere; flag as erasure audit follow-up.

### 3. `UserMetrics` race on first login — use `upsert`
Parallel tabs hitting login-create simultaneously raise Postgres 23505. Mandate `prisma.userMetrics.upsert({ where: { userId }, create: {...}, update: { totalLogins: { increment: 1 }, lastLoginAt: now, lastSeenAt: now } })`.

### 4. Heartbeat consistency — single transaction
Wrap heartbeat writes in `prisma.$transaction([updateSession, updateMetrics])`. Do **not** use `totalSecondsOnSite += 60` per heartbeat — compute `durationSec` on end/sweeper, roll up then. Nightly reconcile: `SELECT SUM(durationSec) FROM UserSession WHERE userId = ?`.

### 5. Nullable columns
`endedAt`/`durationSec` null = "session still open" (correct). `ipAddress`/`userAgent`/`country` null = "header missing" (correct; admin UI must tolerate null). Add `@@index([userId, endedAt])` with partial predicate `WHERE endedAt IS NULL` via raw SQL migration for "who's online now" queries.

### 6. ID convention — match existing schema: autoincrement Int
Every model uses `Int @id @default(autoincrement())`. Plan's `String @id @default(cuid())` breaks convention for zero benefit. Use Int PK + optional opaque `token String @unique @default(cuid())` for client visibility.

### 7. Backfill — scan `AuditLog` opportunistically
`AuditLog` already has `userId` + `createdAt` indexed. Backfill `UPDATE UserMetrics SET lastLoginAt = (SELECT MAX(createdAt) FROM AuditLog WHERE userId = ...)`. Note: AuditLog tracks writes, not logins — label as `lastActivityAt` in the admin UI until real session data accrues.

### 8. Retention purge — idempotent, bounded, observable
Use `DELETE FROM "UserSession" USING (SELECT id FROM UserSession WHERE startedAt < now() - interval '90 days' LIMIT 10000) stale WHERE id = stale.id` in a loop. Log deleted count; alert if >50k (signals cron downtime). At 1k MAU × 5 sessions/day × 90d ≈ 450k rows max. Trivial.

### 9. Sweeper race — idempotent single UPDATE
Never do SELECT-then-UPDATE. One statement: `UPDATE UserSession SET endedAt = lastSeenAt, durationSec = EXTRACT(EPOCH FROM (lastSeenAt - startedAt))::int WHERE endedAt IS NULL AND lastSeenAt < now() - interval '30 minutes'`. Live heartbeat mid-sweep bumps `lastSeenAt` out of WHERE — naturally excluded.

### 10. Multi-process safety — advisory lock on cron
`SELECT pg_try_advisory_lock(hashtext('user_session_sweeper'))` at top of sweeper; bail if false. Same for 90-day purge.

### 11. `AuditLog` vs `UserSession` — separate concerns
`AuditLog` = security/compliance write trail. `UserSession` = engagement/analytics. Add `AuditLog { action: "LOGIN" }` per login for permanent trail that outlives 90d session purge.

---

## Appendix D — Best-Practices Research (best-practices-researcher)

### 1. Build vs. buy: hybrid
Keep server-side `UserSession` + `UserMetrics` as source of truth; add `posthog-js` for behavioral analytics. PostHog is not a replacement because (a) admin page needs joins to local tables (leagues, tier), (b) event pricing bends wrong at 5k+ DAU, (c) right-to-erasure is cleaner when you own the data.

PostHog owns: funnels, retention cohorts, session replay, feature flags, A/B tests, raw pageview stream. Configure with `person_profiles: 'identified_only'` to save cost on anonymous traffic.

### 2. Heartbeat cadence — 30s
Medium/YouTube/NYT use 15–30s. 60s undercounts 0–59s sessions as 0. 30s doubles accuracy at negligible extra cost (~120 writes/user/hour). Gate on `visibilityState === "visible"`. Server dedupe: skip if `lastSeenAt` within 25s.

### 3. Session definition
Heartbeat-driven (not GA4 idle). End when (1) explicit logout, (2) tab hidden >30min, (3) no heartbeat >5 min (sweeper truncates durationSec = lastSeenAt - startedAt). Don't start new session on UTM change — GA4 marketing convention irrelevant to authenticated SaaS.

### 4. Multi-tab — one session per browser
Use `BroadcastChannel('fbst-session')` + shared sessionId in `sessionStorage`. Matches Mixpanel/PostHog. Prevents 4× inflated totalSessions from parallel tabs.

### 5. Data retention (GDPR/CCPA 2024-2025)
- 90 days for `UserSession` is defensible (matches GA4's shortest retention).
- EU AI Act Art. 10 and state laws (CPRA, CPA, CTDPA) reinforce data minimization.
- Store truncated IP (`/24`) after 7 days raw retention. Keep UA full but purge at 90d. `UserMetrics` aggregates can retain forever (derived stats, not PII per EDPB).
- Cookie banner not required for strictly-necessary session tracking under ePrivacy Art. 5(3); privacy-policy disclosure is.

### 6. Admin UX patterns (Stripe/Linear/PostHog convergent)
- Default sort `lastSeenAt DESC` (most-recently-active first)
- Primary columns: avatar+email, last seen (relative "3m ago"), session count, tier, actions
- Secondary (IP, UA, country) behind "Details" drawer, not in grid
- Single search input debounced 200ms
- Chip filters above table (not sidebar)
- Row click opens side-drawer (never full-page nav)
- Checkbox column + sticky action bar at bottom for bulk
- 44px rows, 12px padding — matches existing `default` density

### 7. Impersonation — non-negotiable requirements (OWASP ASVS V2 + industry)
1. Dual-identity JWT with `sub: targetUserId` + `impersonator: adminId` (RFC 8693 actor claim)
2. Persistent red sticky banner "Impersonating X — [End]"
3. 30-min TTL max, no refresh
4. Audit log row on start AND end with free-form reason
5. Block destructive actions while impersonating (password, email, delete, payment method)
6. Email real user within 24h unless opted out
7. No auto-login as admin on impersonation end
8. Ship in P0 PR with feature flag; not P1

### 8. `sendBeacon` vs `fetch({ keepalive: true })` in 2025
Prefer `fetch keepalive`. Baseline all modern browsers, supports custom headers (critical for Bearer auth). 64 KiB cap per request. Fire from `visibilitychange → hidden`, not `pagehide`/`unload` (breaks bfcache, unreliable on iOS Safari).

### 9. Server-computed sessions as supplement
Keep heartbeat primary (accuracy during quiet reading). Optionally add lightweight `RequestEvent` table via `attachUser` middleware as backup signal — useful for catching failed heartbeat hook mounts. 7-day retention.

### Sources
MDN Navigator.sendBeacon, MDN Page Visibility API, CSS-Tricks HTTP on page exit, PostHog Sessions docs, PostHog Pricing, Mixpanel Sessions docs, GA4 session definition, OWASP Session Management Cheat Sheet, OWASP Authentication Cheat Sheet, OWASP ASVS V2, Zarana Solanki Impersonation guide, GDPR Local GA4 compliance 2025, Secure Privacy SaaS 2025, Stripe Apps patterns, Pencil & Paper enterprise tables.
