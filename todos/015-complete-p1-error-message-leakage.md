---
status: completed
priority: p1
issue_id: "015"
tags: [code-review, security]
dependencies: []
---

# Error Messages Leak Internal Details in 500 Responses

## Problem Statement
15+ catch blocks return `err?.message` or `error.message` directly to the client in 500 responses. This violates the CLAUDE.md convention: "Error responses MUST NOT leak internal details — return `{ error: "Internal Server Error" }` for 500s." Leaked messages can expose Prisma query details, database schema info, or internal service errors to attackers.

## Findings
- **Security Sentinel, Pattern Recognition, Agent-Native Reviewer**: All flagged this independently
- Worst offenders:
  - `server/src/features/leagues/routes.ts` — lines 57, 105, 143, 189, 269
  - `server/src/features/commissioner/routes.ts` — lines 82, 98, 134, 316, 423, 471, 502, 515, 531, 547, 603
  - `server/src/features/keeper-prep/routes.ts` — lines 50, 84, 133, 152
  - `server/src/features/archive/routes.ts` — lines 43, 77, 97, 141, 236, 276, 297, 350, 367, 403, 437, 854, 866, 893, 918, 924, 944, 950
  - `server/src/features/admin/routes.ts` — line 306
  - `server/src/features/auth/routes.ts` — line 95 (dev-login leaks Supabase internals)

## Proposed Solutions

### Option A: Sweep all catch blocks (Recommended)
Replace every `err?.message` in HTTP 500 responses with a generic message. Log the actual error server-side.

**Pros**: Simple, mechanical change. Each catch block becomes 2 lines.
**Cons**: Some useful error context lost from client — but that's the point.
**Effort**: Small (1-2 hours)
**Risk**: Low

```typescript
// Before
catch (err) {
  return res.status(500).json({ error: err?.message || "Leagues error" });
}

// After
catch (err) {
  logger.error({ error: String(err) }, "Leagues error");
  return res.status(500).json({ error: "Internal Server Error" });
}
```

### Option B: Global error handler
Add an Express error handler that catches all unhandled errors and returns generic 500s.

**Pros**: Single point of control. Works with `asyncHandler`.
**Cons**: Doesn't fix the explicit `res.status(500).json({ error: err.message })` calls.
**Effort**: Small for the handler, but still need to remove explicit leaks.
**Risk**: Low

## Acceptance Criteria
- [ ] No catch block returns `err?.message` or `error.message` in a response body
- [ ] All 500 errors return `{ error: "Internal Server Error" }` or a safe generic message
- [ ] Actual error details logged server-side via `logger.error`
- [ ] Tests pass

## Work Log
- 2026-03-06: Created from code review synthesis (8 agents)
