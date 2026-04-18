---
status: complete
priority: p2
issue_id: "107"
tags: [code-review, security, performance, public-api]
dependencies: ["103"]
---

# Public endpoint rate limiting + Cache-Control headers

## Problem Statement

`server/src/routes/public.ts` exposes unauthenticated endpoints (`GET /api/public/leagues`, `GET /api/public/leagues/:slug/standings`) that rely only on the global rate limiter (300/min per IP). The standings endpoint triggers `computeTeamStatsFromDb` which fires 3-5 DB queries per call.

An attacker or aggressive bot could exploit these endpoints for resource exhaustion. Additionally, there are no `Cache-Control` headers, so every request recomputes from scratch.

## Findings

### Agent: security-sentinel
- L4: No per-endpoint rate limiting on public endpoints. 300/min global limit too generous for computation-heavy unauthenticated endpoints.

### Agent: performance-oracle
- OPT-2: Public standings endpoint has no rate limiting or caching. Bot traffic could saturate DB connection pool.
- L1: Slug parameter has no format validation.

## Proposed Solutions

### Solution 1: Stricter rate limit + Cache-Control (recommended)
1. Add dedicated rate limiter for public routes: 30-60 req/min per IP
2. Add `Cache-Control: public, max-age=120` header to standings response
3. Add slug format validation: `if (!/^[a-z0-9-]{1,100}$/.test(slug)) return res.status(400)`

- **Pros**: Defense in depth. CDN can cache. Slug validation prevents weird queries.
- **Cons**: Legitimate high-traffic consumers may hit the limit.
- **Effort**: Small (~20 min)
- **Risk**: Low

## Recommended Action

Solution 1. Pairs well with todo 103 (server-side TTL cache on getSeasonStandings).

## Acceptance Criteria

- [ ] Public routes have dedicated rate limiter (30-60 req/min)
- [ ] Standings response includes `Cache-Control: public, max-age=120`
- [ ] Slug parameter validated against `/^[a-z0-9-]{1,100}$/`
- [ ] WeekKey bounds checking (year 2020-2030, week 01-53) if applicable

## Work Log

- **2026-04-16** (Session 67 `/ce:review`): Flagged by security-sentinel (L4) and performance-oracle (OPT-2).

## Resources

- `server/src/routes/public.ts` (target)
- `server/src/index.ts` (global rate limiter reference)
