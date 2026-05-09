---
title: "Mixed Zod versions crash MCP tool registration in CI"
problem_type: runtime_error
component: "MCP fbst-app server"
symptoms:
  - "CI test step `cd mcp-servers/fbst-app && npm test` throws 'Mixed Zod versions detected in object shape'"
  - "McpServer.tool registration fails inside registerWireListTools at src/tools.ts:102"
  - "53/53 tests pass locally but fail deterministically in CI"
date_solved: "2026-05-08"
session: "code review backlog cleanup"
related_pr: 296
related_todos:
  - mcp_fbst_app_ci_gap
tags:
  - zod
  - monorepo
  - mcp-sdk
  - dependency-version-mismatch
  - npm-workspaces
---

## Symptom

CI step `cd mcp-servers/fbst-app && npm test` failed with `Error: Mixed Zod versions detected in object shape.` thrown from the MCP SDK's `tool()` registration:

```
Error: Mixed Zod versions detected in object shape.
 ❯ objectFromShape node_modules/@modelcontextprotocol/sdk/src/server/zod-compat.ts:74:10
 ❯ getZodSchemaObject node_modules/@modelcontextprotocol/sdk/src/server/mcp.ts:1398:15
 ❯ McpServer._createRegisteredTool node_modules/@modelcontextprotocol/sdk/src/server/mcp.ts:888:25
 ❯ McpServer.tool node_modules/@modelcontextprotocol/sdk/src/server/mcp.ts:1036:20
 ❯ McpServer.server.tool __tests__/contract.test.ts:48:13
 ❯ registerWireListTools src/tools.ts:102:10
```

The error appeared immediately after PR #296 added MCP test suites to CI for the `thefantasticleagues-app` monorepo; the same suite passed on the author's local machine.

## Root cause

The MCP SDK (`@modelcontextprotocol/sdk`) compares the zod-instance symbols of every schema passed to a single `tool()` registration. If two schemas in the same call came from different copies of zod, it bails out. The repo has 4 npm workspaces with their own `package.json` files declaring three different zod constraints: root `^4.3.6`, `server/` `^4.3.6`, and `mcp-servers/fbst-app/` `^3.23.0`. The shared schema at `shared/api/wireList.ts` does `import { z } from "zod"` and is consumed by all workspaces.

When `npm ci` runs each workspace independently in CI, `mcp-servers/fbst-app` ends up with its own zod@3 in its local `node_modules`, while the shared schema (loaded into the same V8 context) resolves zod@4 by walking up to the root `node_modules`. Both copies are then live in the same process, so the SDK's identity check fails.

## Fix

```diff
diff --git a/mcp-servers/fbst-app/package.json b/mcp-servers/fbst-app/package.json
   "dependencies": {
     "@modelcontextprotocol/sdk": "^1.13.0",
-    "zod": "^3.23.0"
+    "zod": "^4.3.6"
   },
```

```bash
cd mcp-servers/fbst-app && npm install
git add mcp-servers/fbst-app/package.json mcp-servers/fbst-app/package-lock.json
```

## Why local masked it

A previous `npm install` on the developer's machine had hoisted everything into a single zod copy at the root, so node's nearest-`node_modules` resolution returned the same instance from every workspace. CI's clean per-workspace `npm ci` produced a different layout where `mcp-servers/fbst-app/node_modules/zod` (v3) and the root's `node_modules/zod` (v4) were both materialized, exposing the version mismatch. Multi-version detection is therefore environment-dependent — it only fires when hoisting fails to collapse the duplicates.

## Verification

- 53/53 MCP tests pass locally after the version bump and lockfile regeneration.
- CI green on the next run; the MCP SDK's `zod-compat.ts` shim handles zod v4 cleanly once only one copy is live.

## Prevention

### Detection (proactive)
- Add `scripts/check-duplicate-deps.mjs` that runs `npm ls zod --json` and fails if more than one resolved version appears; wire into `.github/workflows/ci.yml` as a top-level job before per-workspace builds.
- Enforce a root `package.json` `overrides` block pinning `zod` (and other identity-sensitive peers like `@modelcontextprotocol/sdk`) so workspace drift is silently corrected at install time.
- Add an ESLint rule via `eslint-plugin-workspaces` (or a custom rule in `eslint.config.js`) that flags any workspace `package.json` whose `zod` range disagrees with the root version.
- Cache and diff `npm ls --workspaces zod` output in CI; post the table on PRs that touch any `package.json` under `mcp-servers/` or `shared/`.

### Convention (cultural)
- Document in `CLAUDE.md`: any package consuming `shared/api/*` MUST list runtime peers (`zod`, MCP SDK) at the exact root version — never a `^` range that could float.
- New workspace checklist: when scaffolding under `mcp-servers/` or `apps/`, copy the dep block from an existing sibling rather than running `npm init` and picking latest.
- When bumping `zod` (or any schema lib used across workspaces), bump it everywhere in the same PR — partial bumps are forbidden, even if TypeScript is happy.

### Tests

```ts
// mcp-servers/fbst-app/__tests__/zod-singleton.test.ts
// Catches the exact failure mode: MCP SDK's identity check on z.ZodObject
// returns false when two copies of zod are loaded, even if their shapes match.
import { describe, it, expect } from "vitest";
import { z as zLocal } from "zod";
import * as wireListModule from "../../../shared/api/wireList";

describe("zod singleton invariant", () => {
  it("MCP package and shared/api resolve the same zod module", () => {
    // Pull a known schema from the shared module and verify it instantiates
    // through the local zod's ZodObject — proves both sides are the same copy.
    const schema = wireListModule.WireListAddRequestSchema;
    expect(schema instanceof zLocal.ZodObject).toBe(true);
  });
});
```

### Why this class of bug recurs

Monorepos with shared schema modules are a structural minefield whenever an SDK does runtime identity checks (`instanceof`, `Symbol`-tagged brands, or `WeakMap` lookups) against schema objects: each workspace's `node_modules` can independently resolve a different copy, and TypeScript's structural typing happily compiles code that will explode at runtime. Beyond zod, watch for the same trap with **Yup** (uses `__isYupSchema__` symbol checks), **io-ts** (relies on `instanceof` for `Type`), **TypeBox** (kind symbols on schemas), **RxJS** (`Symbol_observable` interop), and **React** itself (the infamous "two copies of React" hooks error). Any time a library says "must be a single instance" or "do not bundle twice," the same npm-workspaces-version-drift pattern will eventually bite — treat them as singletons enforced by `overrides`, not by hope.

## Related

### Documentation
- [docs/CONTRACT_TESTING.md](../../CONTRACT_TESTING.md) — pilot doc for shared/api Zod schemas; the cross-package consumers whose zod versions must align.
- [zod-typed-body-silently-strips-undeclared-fields.md](./zod-typed-body-silently-strips-undeclared-fields.md) — prior runtime-errors entry on a different zod gotcha (silent field stripping).
- [under-declared-ts-type-hid-server-fields.md](../logic-errors/under-declared-ts-type-hid-server-fields.md) — sibling cross-package drift class that motivated the CONTRACT_TESTING pilot.

### Memory entries
- `local_server_tsc_zod_false_negative.md` — TypeScript-resolution false-negative for zod from shared/; runtime sibling of this CI failure.
- `feedback_shared_package_json_required.md` — earlier shared/ zod packaging bug (`type=module`); same "shared schemas need correct package config" family.
- `mcp_fbst_app_ci_gap.md` — explains why this drift went undetected for weeks; PR #296 closes that gap and is what surfaced the version mismatch.
- `wire_list_v1_1_hardening_shipped.md` — context on `mcp-servers/fbst-app/` provenance (PR #283) and its review todos.

### Prior PRs / commits
- PR #213 — `fix(shared): add package.json with type=module so named exports work` — prior shared/ packaging fix; same class (cross-package config drift breaking zod schemas at runtime).
- PR #283 — `feat(mcp): fbst-app MCP server with 12 wire-list tools` — introduced the package whose zod was unpinned; predecessor to the version drift.
- PR #289 — `refactor(wire-list): type-safety sweep — Zod inference, status enums, shared schemas` — established the wire-list shared schema surface that fbst-app re-imports.
- PR #317 / #308 — `fix(errors): classify ZodError throws distinctly` — recent cross-package ZodError handling fix; same "zod identity must match across packages" concern.
