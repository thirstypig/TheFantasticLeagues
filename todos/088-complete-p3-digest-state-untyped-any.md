---
status: complete
priority: p3
issue_id: "088"
tags: [code-review, typescript, type-safety]
dependencies: []
---

# Digest state untyped (any) — define LeagueDigest interface

## Problem Statement
The `digest` state in Home.tsx is fetched as `fetchJsonApi<any>` and the entire digest section cascades with `any` types (setter callbacks, `.map()` params).

## Proposed Solutions
Define a `LeagueDigest` interface matching the AI response shape. Type the state as `LeagueDigest | null`.
- **Effort**: Medium (define interface, update all references)

## Technical Details
- **Affected files**: `client/src/pages/Home.tsx`

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-24 | Created from TypeScript review | Shape is well-known from AI prompt schema |
| 2026-04-30 | Verified resolved during Aurora pilot rewrite + dashboard-perf-and-types pass | The `LeagueDigest` interface this todo asked for already exists as `DigestResponse` in `client/src/pages/home/types.ts`. `Home.tsx` declares `useState<DigestResponse \| null>(null)` and the digest fetch is `fetchJsonApi<DigestResponse>(...)`. All `digest.*.map(...)` callsites narrow to `PowerRanking`, `CategoryMover`, `TeamSpotlight`, etc. via the imported types. No `any` remain in the digest path. |
