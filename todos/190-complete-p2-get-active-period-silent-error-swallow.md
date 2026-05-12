---
status: pending
priority: p2
issue_id: "190"
tags: [code-review, mobile, wire-list, error-handling]
dependencies: [189]
---

# getActivePeriod silent .catch makes 404 and 500 indistinguishable

## Problem Statement

`MobileWireList` swallows all errors from `getActivePeriod` with a silent `.catch(() => {})`. A real 500 from the server and a genuine 404 "no active period" both result in the component silently rendering an empty state with no feedback to the user. Network failures are invisible.

## Findings

- **File**: `client/src/mobile/pages/MobileWireList.tsx`
- Pattern: `getActivePeriod(leagueId).then(setActivePeriod).catch(() => {})` (or equivalent)
- `ApiError` at status 404 = "no active period for this league" → expected, silent OK.
- `ApiError` at status 500+ = server error → should surface to user.
- Non-`ApiError` (network timeout, DNS failure) → should surface to user.

## Proposed Solution

Import `ApiError` from `../../api/base` and discriminate:

```ts
.catch((err) => {
  if (err instanceof ApiError && err.status === 404) return; // no active period
  reportError(err, { source: "mobile-wire-list" }); // all other errors → toast
});
```

This mirrors the pattern already used in `WireListOwnerPage`.

## Acceptance Criteria

- [ ] `getActivePeriod` errors are discriminated: 404 silenced, all others surfaced via `reportError`
- [ ] `ApiError` import verified (not plain `Error`)
- [ ] tsc clean

## Work Log

- 2026-05-11: Identified in PR #333 `/ce:review` security/error-handling pass.
