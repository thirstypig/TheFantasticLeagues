---
status: complete
priority: p2
issue_id: 264
tags: [code-review, security, api, fetchJsonPublic]
dependencies: []
---

## Problem Statement

PR #377 adds `init?: RequestInit` to `fetchJsonPublic`. The `...init` spread before the explicit headers/signal overrides means: (a) a caller can override `method`, `credentials`, `mode`, `body` on what is supposed to be a safe read-only public API fetch function; (b) if a caller passes `credentials: 'include'`, it survives the spread because no override is hardcoded after it; (c) a caller that passes `{ signal: myController.signal }` loses the built-in 30-second timeout (uses `??` so caller signal replaces it rather than composing); (d) the magic number `30000` is used instead of the shared `DEFAULT_TIMEOUT_MS` constant.

## Findings

From `client/src/api/base.ts` (PR #377):
```typescript
export async function fetchJsonPublic<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,                                           // ← caller controls method, credentials, body
    headers: { Accept: "application/json", ...init?.headers },
    signal: init?.signal ?? AbortSignal.timeout(30000), // ← caller signal replaces timeout entirely
  });
}
```
- `fetchJsonApi` (same file, line 89) hardcodes `credentials: 'omit'` after the spread — `fetchJsonPublic` does not.
- Caller passing `{ signal: myController.signal }` loses the 30s safety net.
- Magic `30000` vs `DEFAULT_TIMEOUT_MS` — will diverge when the timeout is configured elsewhere.
- Security reviewer: "...compounded by the lack of any allowlist for which domains fetchJsonPublic may target, meaning a caller can pass any URL including app-internal relative paths."

## Proposed Solutions

### Option A — Hard-code safety overrides after the spread (Recommended)
```typescript
export async function fetchJsonPublic<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    method: "GET",          // always GET for public fetches
    credentials: "omit",    // never send cookies to external APIs
    headers: { Accept: "application/json", ...init?.headers },
    signal: AbortSignal.any([
      ...(init?.signal ? [init.signal] : []),
      AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    ]),
  });
}
```
**Pros:** Preserves caller signal AND the built-in timeout; prevents credential leaks; matches fetchJsonApi's credential posture. **Cons:** None. **Effort:** Small. **Risk:** None.

### Option B — Only accept `signal?: AbortSignal` instead of full `RequestInit`
Narrow the parameter: `(url: string, options?: { signal?: AbortSignal })`. **Pros:** Smallest attack surface. **Cons:** Callers can't set custom headers. **Effort:** Tiny. **Risk:** May need wider options later.

## Recommended Action

Option A. Mirrors the safety pattern already established in `fetchJsonApi` and composes both signals correctly.

## Technical Details

- **File:** `client/src/api/base.ts` ~line 161
- `DEFAULT_TIMEOUT_MS` is already defined in this file — use it instead of `30000`
- `AbortSignal.any()` is available in modern browsers (Chrome 116+, Safari 17.4+) — check browser compat if needed, or use a polyfill

## Acceptance Criteria

- [ ] `credentials: 'omit'` hardcoded after the spread
- [ ] `method: 'GET'` hardcoded after the spread
- [ ] `AbortSignal.any([callerSignal, AbortSignal.timeout(DEFAULT_TIMEOUT_MS)])` when caller provides signal
- [ ] `DEFAULT_TIMEOUT_MS` constant used instead of magic `30000`
- [ ] `cd client && npx tsc --noEmit` clean

## Work Log

### 2026-06-05 — Surfaced by security-sentinel and code-simplicity-reviewer during session review
