---
status: complete
priority: p2
issue_id: 293
tags: [code-review, security, data-safety, testing, prisma]
dependencies: []
---

## Problem Statement

The guard protecting the destructive draft integration suite (which runs unscoped `deleteMany({})` on core tables — a full DB wipe) has two weaknesses that together form a low-likelihood but catastrophic prod-data-loss path. The suite gates on `describe.skipIf(!isLocalThrowawayDbUrl(process.env.DATABASE_URL))`.

1. **Fails OPEN.** The suite *runs by default* and is suppressed only when the guard affirmatively recognizes a non-local host. Any guard false-positive → the wipe executes against whatever `DATABASE_URL` names.
2. **The guard is a substring regex, not a host parse.** `/@(localhost|127\.0\.0\.1)[:/]/.test(url)` matches anywhere in the string. Postgres URLs can contain `@` in more than one place, so a remote host can be matched as "local."

## Findings

- **File**: `server/src/lib/dbSafety.ts:20`; consumer `server/src/features/draft/__tests__/draftIntegration.test.ts:14` (wipe at lines 18–26).
- **Severity**: P2 — accidental trigger likelihood with the *current* prod URL (clean Supabase pooler `...@aws-1-us-west-1.pooler.supabase.com:6543`) is ~zero, so it's not P1; but this is the last line of defense against erasing the production league, and it's trivially hardened.
- **Working bypasses (verified by review agents: regex says `true`, `new URL().hostname` says PROD):**
  - Multi-`@` userinfo: `postgresql://user:p@localhost:5432@db.prod.supabase.co:5432/postgres`
  - Query param: `postgresql://postgres:pw@db.prod.supabase.co:6543/postgres?application_name=svc@localhost:1`
- **Known Pattern**: [[feedback_destructive_integration_tests]] (the guard's origin); [[shared_supabase_db]] (the historical local=prod risk this guards against).

## Proposed Solutions

### Option A (recommended) — fail-closed opt-in + host-parse allowlist
1. Add an independent second factor no prod/CI/staging env carries:
   ```ts
   const DESTRUCTIVE_DB_TESTS_OK =
     isLocalThrowawayDbUrl(process.env.DATABASE_URL) &&
     process.env.ALLOW_DESTRUCTIVE_DB_TESTS === "1";
   describe.skipIf(!DESTRUCTIVE_DB_TESTS_OK)("Draft Integration Tests", () => { ... });
   ```
2. Rewrite the guard to parse the host instead of substring-matching:
   ```ts
   export function isLocalThrowawayDbUrl(url: string | undefined | null): boolean {
     if (!url) return false;
     let host: string;
     try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
     return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
   }
   ```
3. Add the two bypass strings above to `dbSafety.test.ts` as regression cases (both must assert `false`).
- **Pros**: A misconfigured `DATABASE_URL` alone can never trigger the wipe; neutralizes regex bypasses, SSH-tunnel cases, and TOCTOU as single points of failure. **Cons**: contributors running the suite locally must set `ALLOW_DESTRUCTIVE_DB_TESTS=1`. **Effort**: Small. **Risk**: Low.

### Option B — host-parse only (no opt-in flag)
Just the `new URL().hostname` rewrite. **Pros**: smaller; closes the demonstrated bypasses. **Cons**: still fails open; a future regex/URL edge case or a localhost SSH tunnel to prod re-opens the hole. **Effort**: Trivial. **Risk**: Medium (leaves the polarity problem).

### Option C — pass validated URL into the client
Additionally construct `new PrismaClient({ datasources: { db: { url } } })` for this suite from the explicitly-validated URL, so the connection can't drift from the string that was checked (closes TOCTOU). Pairs with A.

## Recommended Action

(blank — triage)

## Technical Details

- Affected: `server/src/lib/dbSafety.ts`, `server/src/lib/__tests__/dbSafety.test.ts`, `server/src/features/draft/__tests__/draftIntegration.test.ts`.
- Also add a docstring caveat: host-based detection cannot see through an SSH tunnel / `kubectl port-forward` (a `localhost` host may forward to prod) — the opt-in flag is the real mitigation.

## Acceptance Criteria

- [ ] Destructive suite requires BOTH a localhost host AND `ALLOW_DESTRUCTIVE_DB_TESTS=1` (fails closed).
- [ ] `isLocalThrowawayDbUrl` parses the host (not substring); the two documented bypass URLs assert `false` in `dbSafety.test.ts`.
- [ ] Docstring notes the tunnel limitation.
- [ ] Full suite still green; draft suite still skips in CI.
- [ ] `git mv` this todo to complete.

## Work Log

- 2026-06-29: Filed from `/ce:review` (security-sentinel + kieran-typescript-reviewer both independently flagged). No P1; current prod URL is safe, but the failure mode is a full prod wipe.
- 2026-06-29: RESOLVED (PR fix/review-followups). Rewrote `isLocalThrowawayDbUrl` to parse the host via `new URL().hostname` (allowlist localhost/127.0.0.1/::1); added fail-closed `ALLOW_DESTRUCTIVE_DB_TESTS=1` second factor to the draft suite; added docstring tunnel caveat; added the two bypass URLs (multi-`@` userinfo + query param) as regression tests asserting `false`. Verified: draft suite now skips with localhost-only env (no flag); full suite green.
