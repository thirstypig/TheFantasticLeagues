---
title: "Zod-typed body literal silently strips undeclared fields"
problem_type: integration-issue
component: shared-api contract / stats-freshness rollout
severity: medium
prevention_priority: high
tags: [contract-testing, zod, typescript, shared-api, excess-property-check, client-wrapper, destructuring, stats-freshness, browser-verification]
pr: 281
commit: fc15935
date_solved: 2026-05-08
related:
  - docs/solutions/logic-errors/under-declared-ts-type-hid-server-fields.md
  - docs/CONTRACT_TESTING.md
  - feedback memory `feedback_test_fixtures.md`
  - feedback memory `local_server_tsc_zod_false_negative.md`
---

# Zod-typed body literal silently strips undeclared fields

## Symptoms

- "Updated &lt;date&gt;" freshness badge silently absent on `/teams/LDY` (Aurora v3 hub) and `/teams/LDY/classic` (legacy) for hours after the stats-freshness rollout deploy.
- Same badge silently absent on the Aurora `/season` page.
- Server logs and `/api/player-season-stats` payload showed only `{ stats }`; `computedAt` never reached the wire even though the route handler was attempting to send it.
- `/api/standings/season` payload contained `computedAt` correctly, but it never reached components — the client wrapper destructured a fixed set of keys and dropped it.
- `tsc --noEmit` clean both sides. Unit tests green. **Browser-verify on prod was the only safety net** that surfaced the regression.

## Root cause

The contract pilot binds the wire shape on both sides to a single Zod schema in `shared/api/playerSeasonStats.ts`. The route handler in `server/src/features/players/routes.ts` writes its response through a typed body literal:

```ts
const body: PlayerSeasonStatsResponse = { ... };
res.json(body);
```

That typed-literal pattern is a contract guard — TypeScript's excess-property check rejects any field that isn't declared in the schema. That's the intended behavior: it prevents the server from drifting *ahead* of the contract.

But the same mechanism has a **bidirectional corollary**: when the schema is *behind* what the handler wants to send, the handler cannot add the field at all without a TS error, so the field is **silently omitted from the wire payload**. The schema enforces the contract in both directions.

In this incident `computedAt` was never declared on `PlayerSeasonStatsResponseSchema`, so the only way to keep tsc green was to leave it out of `body` — which is what shipped. The freshness badge on Team and TeamLegacy went silent.

The second mechanism is independent of the contract pilot. `getSeasonStandings` in `client/src/features/players/api.ts` is a hand-written normalizer that destructured `{ periodIds, periodNames, categoryKeys, rows }` from the raw response and rebuilt the object across four return branches. **Every branch that didn't explicitly forward `computedAt` dropped it.** The server (per PR #268) was sending the field correctly; the wrapper just never read `raw.computedAt`.

Both bugs passed tsc — the types were internally consistent; the wire shape was wrong. Unit tests didn't catch it because the mocked fixtures were written against the same incomplete shapes. Browser-verify on prod was the only safety net.

## Working solution (PR #281, commit `fc15935`)

### 1. Extend the shared schema first

`shared/api/playerSeasonStats.ts`:

```ts
/** The full response envelope. */
export const PlayerSeasonStatsResponseSchema = z.object({
  stats: z.array(PlayerSeasonStatSchema),
  /** Server timestamp marking when this response was assembled (ISO 8601). */
  computedAt: z.string().optional(),
});
```

### 2. Update the typed body literal

`server/src/features/players/routes.ts`:

```ts
// Typed against the shared contract — adding or removing a field from the
// server response that the client's inferred type doesn't expect is a
// compile error. See docs/CONTRACT_TESTING.md.
const body: PlayerSeasonStatsResponse = {
  stats: expandedStats,
  computedAt: new Date().toISOString(),
};
res.json(body);
```

### 3. Forward the field in the client wrapper

`client/src/features/players/api.ts` (every return branch of `getSeasonStandings`):

```ts
const url = `${API_BASE}/season?leagueId=${lid}`;
const raw = await fetchJsonApi<Record<string, unknown>>(url);

const computedAt = typeof raw?.computedAt === "string" ? raw.computedAt : undefined;

// Backend returns { data: [...] }
if (raw && Array.isArray(raw.data)) {
  return { periodIds: [], rows: raw.data as SeasonStandingRow[], computedAt };
}

if (raw && Array.isArray(raw.rows)) {
  const periodIds = Array.isArray(raw.periodIds)
    ? (raw.periodIds as unknown[]).map((x) => Number(x)).filter(Number.isFinite)
    : [];
  const periodNames = Array.isArray(raw.periodNames) ? (raw.periodNames as string[]) : [];
  const categoryKeys = Array.isArray(raw.categoryKeys) ? (raw.categoryKeys as string[]) : [];
  return { periodIds, periodNames, categoryKeys, rows: raw.rows as SeasonStandingRow[], computedAt };
}
if (Array.isArray(raw)) return { periodIds: [], rows: raw as SeasonStandingRow[], computedAt };
return { periodIds: [], rows: [], computedAt };
```

## Why this is generic (and will recur)

This failure mode is structurally baked into the contract pilot pattern documented in `docs/CONTRACT_TESTING.md`. Any endpoint that adopts a `shared/api/*.ts` Zod schema and writes its response via `const body: ResponseType = { ... }` inherits a *bidirectional* contract: the schema rejects fields the server tries to add unilaterally (the intended guard) AND rejects fields the schema author forgot to declare (the unintended trap).

When a feature later needs to extend the wire shape — adding a freshness timestamp, a request id, a feature flag, an etag — the schema declaration **must be updated first** or the field will be silently stripped at the body literal, with no test or tsc signal.

The same recurrence pattern applies to every hand-written client wrapper that destructures a raw response into a view model: any field not explicitly named in every return branch is dropped, and tsc is happy because the wrapper's declared return type matches its declared shape.

As more endpoints adopt the contract pilot, this exact two-headed bug — schema-incomplete + wrapper-incomplete — will recur on every freshness/metadata field added after the initial schema lands. **The only reliable detector is browser-verify against prod after any wire-shape change.** Hence the prevention strategies below.

## Prevention strategies

### 1. Schema-first authoring rule

When adding or renaming a field on a typed response body, the diff to `shared/api/*.ts` MUST land in the same commit as (and *before* in the diff) the route handler change. Reviewers reject any PR where a route's body literal references a field not present in the matching shared schema's `.shape`.

**CI check:** AST script that walks `server/src/features/**/routes.ts`, extracts keys from object literals returned via `res.json(...)`, intersects with `Object.keys(SharedSchema.shape)`. Fail if literal has a key not in shape OR shape has a required key not in literal.

### 2. Prefer `.parse()` over typed body annotations

Forbid the pattern `const body: SomeResponseSchema = { ... }` and `res.json(body as SomeResponseSchema)`. The annotation makes Zod-inferred types act as a **silent filter** — TS happily drops extras at compile time without any runtime signal.

Replace with:

```ts
res.json(SomeResponseSchema.parse({ ... }));
```

This makes unknown/missing keys throw at runtime in dev/test (where it's catchable) instead of silently dropping them on the wire. Use `z.infer` only on the *consumer* side.

**ESLint rule:** ban `const \w+:\s*\w+ResponseSchema\s*=` in `server/src/features/**/routes.ts`. Grep guard in CI: `rg -n "const\s+\w+\s*:\s*\w+ResponseSchema\s*=" server/src/features` should return zero matches.

### 3. Client wrappers forward, don't destructure

Outlaw `const { a, b } = await api.foo()` inside `client/src/api/**` wrappers. Wrappers must `return response` (or `return { ...response, ...derived }`) so server-added optional metadata flows through unmodified. Destructuring belongs in components, not the transport layer.

**Test pattern:** for each wrapper, mock the server response with an extra unknown key and assert the wrapper preserves it:

```ts
mockServer.respondWith({ ...valid, surpriseField: 1 });
expect((await wrapper()).surpriseField).toBe(1);
```

### 4. Round-trip contract tests for every response schema

Every endpoint listed in `shared/api/*.ts` needs a test that hits the real handler, captures the JSON, and asserts each documented field is present. Today only `server/src/__tests__/integration/stats-computed-at-contract.test.ts` does this for one field on a couple of routes (added in PR #293).

**Generalize into a `contracts/` directory** with one file per response schema. Helper:

```ts
function assertAllSchemaKeysPresent(
  schema: z.ZodObject<any>,
  payload: Record<string, unknown>,
): void {
  for (const key of Object.keys(schema.shape)) {
    expect(payload).toHaveProperty(key);
  }
}
```

Apply to: `WaiverWireListResponse`, `AuctionStateResponse`, `LineupResponse`, and every `*ResponseSchema` in `shared/api/`.

### 5. Strict-mode shared schemas in test env

Wrap `shared/api/*.ts` schemas with `.strict()` (or a test-only `.passthrough()` audit) so that during integration tests, a server response containing a key NOT in the schema fails loudly. Forces the shared schema to stay a **superset of reality**, not a lossy filter.

**Implementation:** monkey-patch in test setup:

```ts
import * as schemas from "../../shared/api";
for (const k of Object.keys(schemas)) {
  if (schemas[k]?._def?.typeName === "ZodObject") {
    schemas[k] = schemas[k].strict();
  }
}
```

### 6. Browser-verify gate on response-shape PRs

Any PR that modifies `shared/api/*.ts` OR `client/src/api/**` requires a checked browser-verification box in the PR template citing the **exact screen + field rendered**. Codify the existing memory note rather than relying on recall.

**GitHub Actions:** `.github/workflows/response-shape-gate.yml` with `paths: ['shared/api/**', 'client/src/api/**', 'server/src/features/**/routes.ts']` checking PR body for `- [x] Browser-verified field render: <screen>, <field>`.

## Reviewer checklist for `shared/api/*.ts` changes

When reviewing a PR that touches a shared Zod schema, ALWAYS:

1. Confirm the schema diff is a **strict superset** of every server `res.json` body literal touched by the same PR. Open the route file in a split view.
2. Confirm every client wrapper consuming that response either spreads the full object (`return { ...raw, derived: ... }`) or has been audited to forward the new field through every return branch.
3. Demand a contract-test diff in the same PR — no schema field ships without a test that asserts it appears on the wire.
4. Require the browser-verify checkbox naming the screen and the specific field rendered, especially for fields that drive conditional UI (timestamps, flags, counts) where absence is **visually silent**.

## Long-term: codemod to runtime-validated responses

The highest-leverage fix is to replace handwritten body literals with `schema.parse({ ... })` in a codemod pass so the type system stops being a silent filter and becomes a runtime guard — which is what PR #281 retroactively wished it had. Pair with a `shared/api/coverage.md` listing every `*ResponseSchema` and whether it has a contract test; fail CI if a new schema lands without one.

## Related

- **`docs/solutions/logic-errors/under-declared-ts-type-hid-server-fields.md`** — direct precedent. Same bug class (schema/type drift between sides) but inverse direction (client TS type missed a server field). PR #281 extends the lesson to "schema-as-stripper" where Zod composition drops fields rather than just hand-written types.
- **`docs/CONTRACT_TESTING.md`** — the contract pilot policy. PR #281 is a real-world failure of the pilot working partially: the schema existed but didn't declare `computedAt`. The "What this pattern does NOT do" section needs updating to call out that a typed-body literal silently strips undeclared fields.
- **PR #293** — the cross-cutting contract test added in direct response: `server/src/__tests__/integration/stats-computed-at-contract.test.ts`. The codified prevention.
- **PR #268** — introduced `computedAt` on stat endpoints; PR #281 fixed the gap where the schema wasn't updated alongside.
- **PRs #270, #271, #273, #279** — sibling `computedAt` rollouts across other pages; useful context for the rollout pattern that this gap interrupted.
- **Memory `feedback_test_fixtures.md`** — adjacent failure mode: tests passed because mocks fabricated fields the real API never sends. Same lesson — the wire shape, not the test fixture, is the contract.
- **Memory `local_server_tsc_zod_false_negative.md`** — relevant tooling caveat: local `cd server && npx tsc` can false-positive zod resolution errors on `shared/api/*`, so CI is the authority for any schema-plumbing fix.

## Verification

- `cd client && npx tsc --noEmit` — clean
- `cd server && npx tsc --noEmit` — clean (ignoring phantom zod errors per memory note)
- Server tests: 1060 / 7 skipped / 1 todo
- Client tests: 661 pass (including 16 new `<DataFreshness>` unit tests + 2 cross-cutting contract tests added in PR #293)
- Browser-verified on prod (`https://app.thefantasticleagues.com`) — date+time badge rendering on `/teams/LDY`, `/season`, `/players`, `/matchup`, classic equivalents
