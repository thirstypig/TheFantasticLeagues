---
title: ScoringSettings — untyped fetchJsonApi responses hide API contracts
description: TypeScript can't infer shape of Promise<unknown> returned by fetchJsonApi; accessing properties fails strict type checking until response types are declared
problem_type: integration-issues
component: ScoringSettings
file: client/src/features/commissioner/pages/ScoringSettings.tsx
affected_version: 859e1bc (Scoring Engine Phase 3 feature)
severity: high
solved_in_session: 2026-06-22
error_count: 5
search_keywords: fetchJsonApi, Promise<unknown>, untyped API response, type boundary, request/response interface, API contract, cross-module typing
---

## Problem Symptom

When implementing the ScoringSettings component (Scoring Engine Phase 3), TypeScript strict mode reported 5 compilation errors in the fetch handlers:

```
error TS18046: 'settingsResp' is of type 'unknown'.        (line 53)
error TS18046: 'settingsResp' is of type 'unknown'.        (line 54)
error TS18046: 'rosterResp' is of type 'unknown'.          (line 60)
error TS2353: Object literal may only specify known properties, and 'rules' does not exist in type 'RequestInit'.  (line 88)
error TS2353: Object literal may only specify known properties, and 'slots' does not exist in type 'RequestInit'. (line 112)
```

The errors blocked compilation despite the feature being production-ready and shipped to prod (commit 859e1bc).

## Root Cause

The `fetchJsonApi()` function in `client/src/api/base.ts` declares:

```typescript
async function fetchJsonApi<T>(url: string, init?: RequestInit): Promise<T>
```

When called **without explicit type arguments**, TypeScript infers `T = unknown`:

```typescript
const settingsResp = await fetchJsonApi(`GET /api/leagues/${leagueId}/scoring-settings`);
// Type of settingsResp: Promise<unknown>
// Accessing .rules or .sport on unknown is a type error
```

The second set of errors (RequestInit type mismatch) arose because the save handlers passed partial objects without proper typing:

```typescript
await fetchJsonApi(`PATCH /api/leagues/${leagueId}/scoring-settings`, {
  rules,  // Plain object, no type declaration
});
// 'rules' is not a known property of RequestInit
```

**The integration contract issue:** The generic type parameter on `fetchJsonApi` is not constrained. Without explicit type arguments at call sites, or without response type definitions declared in the called endpoint, the API boundary is opaque to TypeScript.

## Investigation Steps Tried

1. **Initial attempt:** Removed the `as RequestInit` casts and attempted to pass plain objects
   - Result: TypeScript still complained; API response type remained `unknown`
   - Learning: The issue is bidirectional — both request and response shapes are unconstrained

2. **Checked fetchJsonApi signature:** Confirmed the generic is unconstrained
   - Result: Caller must provide type annotations; the function can't infer them
   - Learning: No clever refactoring of the wrapper would help; the caller is responsible

3. **Explored shared Zod schemas:** Checked if `shared/api/` had existing patterns
   - Result: `shared/api/` exists but ScoringSettings endpoints lack schemas
   - Learning: This aligns with project precedent: new endpoints need explicit type definitions

## Working Solution

Added four TypeScript interfaces to define the API contract at the call site:

### Step 1: Define Response Types

```typescript
interface ScoringSettingsResponse {
  leagueId: number;
  sport: "NFL" | "NBA";
  rules: ScoringRule[];
}

interface RosterConfigResponse {
  leagueId: number;
  slots: Record<string, number>;
}
```

### Step 2: Define Request Types

```typescript
interface SaveScoringSettingsRequest {
  rules: ScoringRule[];
}

interface SaveRosterConfigRequest {
  slots: Record<string, number>;
}
```

### Step 3: Type the GET Handlers

```typescript
// BEFORE: Unknown type on response
const settingsResp = await fetchJsonApi(
  `GET /api/leagues/${leagueId}/scoring-settings`
);
setRules(settingsResp.rules);  // Type error

// AFTER: Explicit response type
const settingsResp = await fetchJsonApi(
  `GET /api/leagues/${leagueId}/scoring-settings`
) as ScoringSettingsResponse;
setRules(settingsResp.rules);  // OK: rules is ScoringRule[]
setSport(settingsResp.sport);  // OK: sport is "NFL" | "NBA"
```

### Step 4: Type the PATCH Handlers

```typescript
// BEFORE: Invalid RequestInit
await fetchJsonApi(`PATCH /api/leagues/${leagueId}/scoring-settings`, {
  rules,  // Not a valid RequestInit property
});

// AFTER: Properly-typed request
const payload: SaveScoringSettingsRequest = { rules };
await fetchJsonApi(`PATCH /api/leagues/${leagueId}/scoring-settings`, {
  body: JSON.stringify(payload),
} as RequestInit);
```

Same pattern for roster config.

### Step 5: Verify

```bash
cd client && npx tsc --noEmit
# ✓ No errors
```

All 5 TypeScript errors resolved. Full test suite passes (893 frontend tests, 1289 backend tests).

## Why This Approach

1. **Minimal boilerplate:** Four interface definitions; no wrapper refactoring
2. **Matches project patterns:** Aligns with shared Zod schema future direction (see CLAUDE.md Contract Testing)
3. **Type safety at boundaries:** Call site explicitly states what shape to expect
4. **Reusable:** Interfaces can be migrated to `shared/api/scoring.ts` (Zod schema) in a future PR if the endpoints need to be consumed by MCP servers or other clients
5. **No runtime cost:** Interfaces are compile-time only; the JSON over the wire is unchanged

## Prevention: Best Practices

### 1. Enforce Shared Zod Schemas for New Endpoints

When adding a new endpoint that will be consumed by client code:

```typescript
// Step 1: Create shared/api/myEndpoint.ts
export const MyResponseSchema = z.object({
  id: z.number(),
  data: z.string(),
});
export type MyResponse = z.infer<typeof MyResponseSchema>;

// Step 2: Server imports and validates
import { MyResponseSchema, MyResponse } from "@shared/api/myEndpoint.js";
const body: MyResponse = { id: 1, data: "test" };
res.json(body);

// Step 3: Client imports and uses
import type { MyResponse } from "@shared/api/myEndpoint";
const data = (await fetchJsonApi(endpoint)) as MyResponse;
```

For endpoints without shared schemas (legacy), use local interfaces in the component as a stopgap.

### 2. Annotate Server Response Types Explicitly

Every `res.json(body)` call should have an explicit type annotation above it:

```typescript
// ✓ Good
const body: ScoringSettingsResponse = {
  leagueId: league.id,
  sport: league.sport as "NFL" | "NBA",
  rules: league.rules,
};
res.json(body);

// ✗ Bad (no annotation; type drift possible)
res.json({
  leagueId: league.id,
  sport: league.sport,
  rules: league.rules,
});
```

TypeScript will error if the built object doesn't match the declared type.

### 3. Use `curl` Before Writing Client Code

Before accessing `response.rules` in a component, fetch the endpoint and inspect the actual JSON:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4010/api/leagues/1/scoring-settings" | jq .

# Output:
# {
#   "leagueId": 1,
#   "sport": "NFL",
#   "rules": [...]
# }
```

Compare three things:
1. **Curl output** — what the endpoint actually returns
2. **Server handler** — what the backend builds
3. **Client type** — what the component expects

All three must align.

### 4. Test Field Presence

Add integration tests verifying that expected fields exist:

```typescript
it("GET /api/leagues/:id/scoring-settings returns rules field", async () => {
  const response = await fetchJsonApi(
    `GET /api/leagues/${leagueId}/scoring-settings`
  ) as ScoringSettingsResponse;
  
  expect(response).toHaveProperty("rules");
  expect(Array.isArray(response.rules)).toBe(true);
  expect(response.rules.length).toBeGreaterThan(0);
});
```

This catches the gap between declared types and actual runtime behavior.

### 5. Code Review Checklist for API Changes

When reviewing a PR that adds or modifies an endpoint:

- [ ] Is there an explicit type annotation on the `res.json(body)` call?
- [ ] Does the client import a shared Zod schema, or have a local interface?
- [ ] Are there integration tests verifying field presence (not just shape)?
- [ ] Was `curl` used to manually verify the response before the PR?
- [ ] If the response is optional or nullable, is that documented in the interface?

## Related Documentation

- **[feedback_shared_package_json_required.md](/memory/feedback_shared_package_json_required.md)** — Shared modules need `"type": "module"` to support runtime imports; type-only imports hide ESM issues. Relevant: shared/api schemas must be importable from both client and server.
- **[feedback_test_fixtures.md](/memory/feedback_test_fixtures.md)** — Unit test mocks must mirror real API response shapes; fabricated fields let buggy production code pass tests. Same principle: API contract accuracy matters.
- **[under-declared-ts-type-hid-server-fields.md](../logic-errors/under-declared-ts-type-hid-server-fields.md)** — Team response declared `{id, playerId, name, posPrimary, price}` but server included `posList`; type drift caused silent fallback. Same root cause: incomplete type definitions at API boundaries.
- **[zod-typed-body-silently-strips-undeclared-fields.md](../runtime-errors/zod-typed-body-silently-strips-undeclared-fields.md)** — Typed body annotations can hide fields; Zod `.parse()` prevents silent drops. Related pattern: runtime validation of API contracts.
- **[mixed-zod-versions-mcp-sdk-tool-registration.md](../runtime-errors/mixed-zod-versions-mcp-sdk-tool-registration.md)** — Monorepo dependency conflicts can break schema sharing. Relevant if ScoringSettings endpoints are later exposed as MCP tools.
- **CLAUDE.md** — `shared/api/` documented as the **cross-side source of truth for API contracts**. This solution implements that pattern locally; migrate to shared schemas when endpoints are stable.
- **docs/CONTRACT_TESTING.md** (referenced in CLAUDE.md) — Formal guide on Zod-first API contracts and avoiding schema drift.

## Key Takeaway

**API boundaries must be explicit.** Untyped generic functions like `fetchJsonApi<T>()` push type inference onto the caller. Without explicit types at call sites or shared schema contracts, the TypeScript compiler can't help — and silent runtime errors follow.

For new endpoints: create a Zod schema in `shared/api/` and import it on both sides.  
For existing endpoints: use local interfaces in the component and migrate to shared schemas when the endpoint stabilizes.

In both cases, the type annotation goes at the API boundary, not hidden inside wrapper functions.
