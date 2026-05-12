---
status: pending
priority: p2
issue_id: "191"
tags: [code-review, mobile, wire-list, security, error-handling]
dependencies: []
---

# Wire list mobile page renders err.message verbatim — exposes 5xx server detail

## Problem Statement

`MobileWireList` catches errors and renders `err.message` directly into the UI. `ApiError.message` is constructed from `serverMessage` (the raw server-side message). If a 500 path ever returns an internal detail (stack trace fragment, SQL error, etc.) in `serverMessage`, it will be displayed verbatim to the end user.

## Findings

- **File**: `client/src/mobile/pages/MobileWireList.tsx`
- Error display pattern: `<p>{err.message}</p>` or similar
- `ApiError` populates `.message` from `serverMessage` which is the server's raw error string
- CLAUDE.md convention: "Error responses MUST NOT leak internal details" — but this client-side pattern re-leaks whatever the server sends
- Not currently exploitable (server 500s return generic messages), but fragile — one new 500 path breaks this

## Proposed Solution

Replace `err.message` with a static user-friendly string, and rely on `reportError` + the `ErrorToast` for the correlation code:

```ts
.catch((err) => {
  reportError(err, { source: "mobile-wire-list" });
  setError("Failed to load wire list. Please try again.");
});
```

Users see the safe static message + the ERR-code in the toast for support correlation.

## Acceptance Criteria

- [ ] `MobileWireList` never renders `err.message` directly in JSX
- [ ] Errors reported via `reportError` for toast display
- [ ] Static fallback string shown in the card body
- [ ] tsc clean

## Work Log

- 2026-05-11: Identified in PR #333 `/ce:review` security pass.
