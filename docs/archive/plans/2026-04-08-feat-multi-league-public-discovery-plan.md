---
title: "Multi-League Support + Public League Discovery"
type: feat
status: active
date: 2026-04-08
deepened: 2026-04-09
---

# Multi-League Support + Public League Discovery

## Enhancement Summary

**Deepened on:** 2026-04-09 (5 agents: repo research, best practices, security, architecture, specflow)

### Key Changes from Deepening
1. **No new modules needed** — `leagues` module already has routes, pages, and API for discovery + creation. Extend it, don't duplicate it.
2. **4 Critical IDOR vulnerabilities** found that MUST be fixed before multi-league (standings, periods, roster, copyFromLeagueId)
3. **Sidebar league dropdown is commissioner-gated** — one-line fix to show for all multi-league users
4. **OPEN = auto-join, PUBLIC = approval required** — semantic distinction clarified
5. **Team assignment post-join** is a critical gap — membership without Team = broken experience
6. **Franchise name collision** enables privilege escalation — must fix on self-service creation
7. **Schema migration needed** — visibility/maxTeams/description fields exist in schema but have no migration

---

## Overview

Enable users to participate in multiple leagues simultaneously and discover/join public leagues. Must follow the feature module pattern with strict isolation — no cross-league data leaks.

## Current State (verified by repo research agent)

**Already built:**
- `LeagueContext` supports league switching: `leagueId`, `setLeagueId`, `leagues` list, `localStorage` persistence
- `GET /api/leagues/public` endpoint exists (returns PUBLIC/OPEN leagues)
- `GET /api/leagues/join-info/:inviteCode` endpoint exists (pre-auth landing page)
- `POST /api/leagues/join` endpoint exists (invite code join)
- `POST /api/leagues` endpoint exists (self-service creation, 5-league cap)
- `CreateLeague.tsx` page exists at `/create-league`
- `JoinLeague.tsx` page exists at `/join/:inviteCode`
- `LeagueInvite` model with PENDING/ACCEPTED/EXPIRED/CANCELLED statuses
- `Franchise` model as org-level parent with `isPublic`, `publicSlug`, `inviteCode`
- `League.visibility` (PRIVATE/PUBLIC/OPEN), `maxTeams`, `description`, `entryFee` fields in schema
- `requireLeagueMember` middleware with 2-min membership cache

**NOT built (gaps):**
- No `/discover` route accessible to unauthenticated users (all routes redirect to `/login`)
- Sidebar league dropdown gated behind `canAccessCommissioner` — regular owners can't switch
- No "Request to Join" flow for PUBLIC leagues (only instant join via invite code)
- No `maxTeams` enforcement on join endpoint (server-side)
- No team assignment after join approval
- No migration for visibility/maxTeams/description fields (`as any` casts in routes)
- No join request notification to commissioners
- Standings, periods, and roster routes LACK `requireLeagueMember` — cross-league data leak

---

## Phase 0: Security Prerequisites (MUST fix before any multi-league work)

### Critical IDOR Fixes

| Endpoint | File | Issue | Fix |
|----------|------|-------|-----|
| `GET /period/current` | standings/routes.ts:18 | No `requireLeagueMember` | Add middleware |
| `GET /period-category-standings` | standings/routes.ts:46 | No `requireLeagueMember` | Add middleware |
| `GET /api/periods` | periods/routes.ts:31 | Returns ALL periods if no leagueId | Add middleware + require leagueId |
| `GET /api/roster/:teamCode` | roster/routes.ts:79 | No auth beyond requireAuth, no league scope | Add leagueId filter |
| `GET /api/roster/year/:year` | roster/routes.ts:90 | Returns ALL leagues' rosters | Add leagueId filter |
| `GET /api/teams/:id/summary` | teams/routes.ts:339 | No league membership check | Derive leagueId from team, check membership |
| `GET /api/teams/trade-block/league` | teams/routes.ts:471 | No `requireLeagueMember` | Add middleware |
| `POST /api/leagues` (copyFromLeagueId) | leagues/routes.ts:434 | Copies private league data without auth | Require commissioner of source league |

### Franchise Name Collision Fix
`CommissionerService.createLeague()` reuses existing Franchise by name match. In self-service creation, this enables privilege escalation (User B's league put under User A's franchise).
**Fix:** Always create new Franchise for self-service creation. Only reuse when `copyFromLeagueId` is from same org.

### Schema Migration
Run `npx prisma migrate dev` to create migration for `visibility`, `maxTeams`, `description`, `entryFee`, `entryFeeNote` fields. Remove `as any` casts in leagues/routes.ts.

---

## Phase 1: Core Multi-League UX (extend `leagues` module — NO new modules)

### 1a. Sidebar League Dropdown for All Users

**One-line fix** in `client/src/components/AppShell.tsx` line 188:
```diff
- {sidebarOpen && canAccessCommissioner && leagues && leagues.length > 1 && (
+ {sidebarOpen && leagues && leagues.length > 1 && (
```

Add visual indicator showing active league name + colored dot in sidebar header.

### 1b. Refresh Leagues List After Join/Create

Currently `leagues` in LeagueContext only refreshes on `user` change. After creating or joining a league, call `refreshLeagues()` to update the sidebar dropdown immediately.

### 1c. Mobile League Switcher

Add league switching to the mobile hamburger menu/sidebar drawer. The `BottomNav` is too space-constrained.

---

## Phase 2: Public League Discovery (extend `leagues` module)

### 2a. Unauthenticated `/discover` Route

Add `/discover` and `/discover/:slug` to the unauthenticated route list in `App.tsx`. Create a lightweight public layout (no sidebar, just header + content).

### 2b. Discovery Page

`client/src/features/leagues/pages/DiscoverLeagues.tsx` — browse public leagues.
- Shows PUBLIC and OPEN leagues
- Card layout with: name, season, team count/max, scoring format, commissioner name (opt-in), visibility badge
- Search by name, filter by sport/format/size
- Pagination (25 per page, server-side)
- Empty state: "No public leagues yet. Create your own!"

### 2c. League Detail Page

`client/src/features/leagues/pages/LeagueDetail.tsx` — view before joining.
- Shows team names, rules summary, season status
- CTA: "Join Now" (OPEN) or "Request to Join" (PUBLIC) or "Sign Up to Join" (unauthenticated)
- Uses `publicSlug` as URL identifier, NOT numeric ID

### 2d. Server Endpoint Updates

- `GET /api/leagues/public` — add pagination (`limit`, `offset`), search (`q`), filters (`sport`, `format`, `size`)
- Use `publicSlug` in responses, not numeric `id` (prevent enumeration)
- Add `maxPlayerName` length (200 chars) on query params

---

## Phase 3: Join Flow (OPEN vs PUBLIC distinction)

### Semantics

| Visibility | Browse | Join | Approval | Use Case |
|------------|--------|------|----------|----------|
| PRIVATE | No | Invite code only | Instant | Default (friends league) |
| PUBLIC | Yes | Request button | Commissioner approves | League wanting to fill slots |
| OPEN | Yes | Join Now button | Instant (auto-accept) | Casual public league |

### 3a. OPEN League Join

Enhance `POST /api/leagues/join` to accept `slug` (not just `inviteCode`). For OPEN visibility:
- Create membership immediately (same as invite code flow)
- Enforce `maxTeams` server-side (reject 409 if full)
- Create a `Team` for the new member (auto-generate name: "{Username}'s Team")

### 3b. PUBLIC League Join Request

Extend `LeagueInvite` model with:
- `type` field: `"INVITE" | "REQUEST"` (default "INVITE" for backward compat)
- `requesterId` field: userId of the requester (for REQUEST type)

`POST /api/leagues/:slug/request-join`:
- Creates `LeagueInvite` with `type: "REQUEST"`, `requesterId`, `status: "PENDING"`, 30-day expiry
- Notifies commissioner via push + email

### 3c. Commissioner Approval

Add to commissioner panel → Members tab:
- "Pending Requests" section showing join requests
- Approve/Reject buttons
- On approve: create `LeagueMembership` + `Team`, notify requester
- On reject: update status to "CANCELLED", notify requester

### 3d. Rate Limiting

- `POST /api/leagues/join` — 5 per hour per user
- `POST /api/leagues/:slug/request-join` — 3 per hour per user
- League creation — track via AuditLog (not current commissioner count)

---

## Phase 4: Data Isolation Audit

### Automated Static Analysis
Script that greps all route handlers for Prisma queries on league-scoped models without `leagueId` filter:
```bash
# Models that MUST be scoped: Team, Roster, Trade, WaiverClaim, AuctionSession,
# Period, TeamStatsPeriod, BoardCard, AiInsight, Matchup, LeagueRule, TransactionEvent
```

### Cross-League Integration Tests
`server/src/__tests__/integration/data-isolation.test.ts`:
- Create 2 leagues with overlapping team codes
- Verify API calls scoped to league A never return league B data
- Test every endpoint that accepts leagueId, teamId, or teamCode

### Runtime Query Logging (dev/staging)
Prisma client extension that warns on unscoped queries against league-scoped models.

---

## Phase 5: Self-Service League Creation Enhancement

### Wizard Steps (3-step, not 5)

**Step 1 — Essentials:** Name, sport, season, scoring format, draft type
**Step 2 — League Size:** Number of teams, roster size, keeper toggle
**Step 3 — Invite:** Generated invite link + email invite form

Advanced settings (waiver type, FAAB, trade deadline) deferred to Commissioner panel.

### Fixes Needed
- Enforce `maxTeams` on join
- Handle duplicate `name+season` gracefully (show error, not 500)
- Persist `leagueType` (NL/AL/MIXED) — currently collected but dropped
- Add `scoringFormat` to `CreateLeagueInput` TypeScript interface

---

## Dependencies

```
Phase 0 (security) → blocks everything
Phase 1 (UX) → independent, do first
Phase 2 (discovery) → depends on Phase 0
Phase 3 (join flow) → depends on Phase 2
Phase 4 (audit) → parallel with Phase 2-3
Phase 5 (creation) → independent enhancement
```

## Acceptance Criteria

- [ ] **Phase 0:** All 8 IDOR endpoints fixed with `requireLeagueMember`
- [ ] **Phase 0:** Franchise name collision fixed for self-service creation
- [ ] **Phase 0:** Schema migration applied (visibility, maxTeams, description)
- [ ] **Phase 1:** All multi-league users see sidebar league dropdown
- [ ] **Phase 1:** Leagues list refreshes after join/create
- [ ] **Phase 2:** Public leagues browsable at `/discover` without auth
- [ ] **Phase 2:** League detail at `/discover/:slug` with join CTA
- [ ] **Phase 3:** OPEN leagues → instant join with Team creation
- [ ] **Phase 3:** PUBLIC leagues → request + commissioner approval
- [ ] **Phase 3:** `maxTeams` enforced server-side on all join paths
- [ ] **Phase 4:** Cross-league data isolation integration tests pass
- [ ] **Phase 4:** Static analysis script finds 0 unscoped queries
- [ ] **Phase 5:** 3-step creation wizard with invite link
- [ ] CLAUDE.md updated with any new cross-feature deps

## Sources & References

### Research Agents
- Repo research: verified all existing infrastructure (LeagueContext, invite flow, creation flow)
- Best practices: ESPN/Yahoo/Sleeper patterns, Prisma multi-tenant extensions
- Security: 4 Critical + 5 High + 6 Medium findings
- Architecture: module boundary recommendations, cron job scaling
- SpecFlow: 5 user flows with 30+ edge cases identified

### Key Codebase References
- `client/src/contexts/LeagueContext.tsx` — league switching state
- `client/src/components/AppShell.tsx:188` — sidebar dropdown gate
- `server/src/features/leagues/routes.ts` — creation, join, public endpoints
- `server/src/features/commissioner/services/CommissionerService.ts` — createLeague flow
- `server/src/middleware/auth.ts` — requireLeagueMember middleware
- `prisma/schema.prisma` — League, Franchise, LeagueInvite, LeagueMembership models
