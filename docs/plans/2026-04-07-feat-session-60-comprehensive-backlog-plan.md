---
title: "Session 60: Comprehensive Backlog — 19 Items"
type: feat
status: active
date: 2026-04-07
deepened: 2026-04-07
---

# Session 60: Comprehensive Backlog — 19 Items

## Enhancement Summary

**Deepened on:** 2026-04-07 (Round 1: 12 review agents, Round 2: 9 deep-dive agents)
**Sections enhanced:** All 19 items + cross-cutting concerns + implementation-level code
**Review agents used:** Round 1: TypeScript, Performance, Security, Architecture, Simplicity, Data Integrity, Deployment, Patterns, Frontend Races, Best Practices, SpecFlow, Deployment Learnings. Round 2: Deep dives on A1, A2, B2, C1, C2+E1, D1+E2, F1, G1-G3, G5+G6

### Key Improvements from Deepening
1. **5 items eliminated** — A3 (no-op), B1 (YAGNI), G4 (already done via `syncAAARosters`), G7 (QA only), G8 (one button click)
2. **2 items merged** — C2 + E1 (same root cause), G1-G3 (backend done, verify UI)
3. **2 HIGH-severity race conditions found** — waiver double-processing needs advisory lock, add/drop rapid-fire needs in-flight guard
4. **1 IDOR vulnerability found** — commissioner roster assign lacks league cross-check
5. **Simplification across the board** — A1 reduced to one-time script, A2 to client-side filtering, C2 skips migration
6. **3 corrections from Round 2** — CSP already has YouTube (E2 is NOT a CSP issue), FUTURE_BUDGET IS enforced at season transition (not broken), Season.tsx has no player data (not applicable for C1)

### Round 2 Key Corrections
- **E2 (YouTube):** CSP `frameSrc` already includes YouTube domains. The issue is likely `X-Frame-Options` or embed URL format, not CSP. Investigate in browser console.
- **G2 (FUTURE_BUDGET):** The budget IS applied during season transition to DRAFT via `seasonService.ts:64-80`. Not a broken promise — just deferred.
- **C1 (Season.tsx):** Season page shows team standings (NormalizedSeasonRow), NOT player lists. No position field exists. Only 3 pages need fixing, not 4.

### New Considerations Discovered
- `mlb-feed/routes.ts` at 1,498 lines is a god module — extract `newsService` before adding server-side news endpoints
- `POS_ORDER` diverges between client and server (client omits SP/RP) — must unify before C1
- Railway uses Railpack (not Nixpacks) as of March 2026
- SQLite cache will be lost on Railway container restart — need persistent volume or accept cold starts
- Depth chart API DOES differentiate SP/CP/P — the real issue is 40-man roster returning generic "P"
- Railway migration is nearly zero-code — `window.location.host` for WS, relative `/api` for fetch

---

## Overview

Tackle the full outstanding backlog in priority order: Session 59 pending items first, then P0/P1/P2. After deepening with 12 review agents, the 19 items collapse to ~10 actual work items.

## Revised Item Status

| Item | Original | After Deepening | Reason |
|------|----------|-----------------|--------|
| A1 | New cron function | One-time admin endpoint/script | Existing syncs cover 99% of cases |
| A2 | New server endpoint | Client-side `usePlayerNews` hook | Client already has cross-referencing logic |
| A3 | Verify AL news | **ELIMINATED** — confirmed no-op | No NL filter exists on news feeds |
| B1 | AL+H2H audit | **ELIMINATED** — YAGNI | No AL/H2H leagues exist |
| B2 | IL SP/RP fix | ~10 lines at line 350 | GS/G ratio from Player table |
| C1 | Position sort on 4 pages | ~20 lines across 4 files | Straightforward `POS_ORDER.indexOf()` |
| C2+E1 | Remove TeamStatsSeason + fix waiver | Fix 2 fallback queries, skip migration | Merging — same root cause |
| D1 | Railway deploy | Operational checklist | Full Go/No-Go matrix produced |
| E2 | YouTube CSP | Add to `frameSrc` (currently empty) | 1-line fix |
| F1 | Test add/drop | Browser test + fix race condition | HIGH-severity rapid-fire bug found |
| G1-G3 | Trade asset processing | **Verify UI only** — backend already done | Backend processes all 5 types |
| G4 | Top 100 prospects | **ELIMINATED** — already done | `syncAAARosters()` is a superset |
| G5 | Pre-draft trade | One-time DB insert | 5-minute script, not a feature |
| G6 | De-emphasize prices | Conditional CSS class | ~5 lines per page |
| G7 | Verify scoring | **ELIMINATED** — QA only | 10-minute browser check |
| G8 | Regenerate Draft Report | **ELIMINATED** — one button click | Feature already exists |

---

## Work Groups & Sequencing

### Group A: Data Enrichment & Display

#### A1. Austin Riley Enrichment (#8)

**Problem:** Players traded after auction show "---" for Pos/MLB.

**Root Cause:** `server/src/features/players/services/mlbSyncService.ts:214-246` — sync only writes `mlbTeam`/`posPrimary` for players found on current 40-man rosters.

**Simplified Solution (per Simplicity Review):**
One-time admin endpoint or script — NOT a daily cron. The existing `syncAllPlayers()` (30 teams) + `syncAAARosters()` (weekly AAA) already cover virtually all players. The handful of edge cases are a one-time backfill.

```typescript
// ~15 lines in admin route or script
const stalePlayers = await prisma.player.findMany({
  where: { mlbId: { not: null }, OR: [{ mlbTeam: null }, { mlbTeam: "" }, { posPrimary: null }] },
  select: { id: true, mlbId: true, posPrimary: true, posList: true },
});
// Batch lookup via people?personIds= (existing fetchPlayerBatch pattern)
// Update mlbTeam and posPrimary, preserving enriched posList
```

**Research Insights:**

**TypeScript (HIGH):** Type the MLB API response — do NOT add another `any[]` function. Use `mlbGetJson<{ people: MlbPersonInfo[] }>(url)` generic.

**Data Integrity (HIGH):** Must replicate the `shouldUpdatePosList` guard from `syncAllPlayers()` (line 238-244). Without it, multi-position eligibility from `syncPositionEligibility()` gets destroyed.

**Performance:** Use `fetchPlayerBatch()` (existing, chunks 50 per request) instead of individual lookups. Add 200ms inter-batch delay.

**Best Practice:** `GET /api/v1/people/{mlbId}` returns position/team even for players not on any roster (free agents, retired). Prefer direct ID lookup over `people/search` (ambiguous for common names).

**Files to modify:**
- `server/src/features/admin/routes.ts` — add `POST /api/admin/enrich-stale-players` endpoint
- Alternatively: `server/src/scripts/enrichStalePlayers.ts` — one-time script

**Acceptance Criteria:**
- [ ] Austin Riley shows correct position and MLB team
- [ ] `posList` not overwritten for enriched players
- [ ] Uses `mlbGetJson<T>()` generic (not `any`)

---

#### A2. Player Profile News Links (#1)

**Problem:** PlayerDetailModal has External Links but no news articles.

**Simplified Solution (per Simplicity + Architecture Reviews):**
Client-side `usePlayerNews(playerName)` hook reusing existing news API calls — NOT a new server endpoint. The Home page already fetches all 5 feeds and cross-references player names. Zero server changes needed.

```typescript
// client/src/hooks/usePlayerNews.ts (~30 lines)
function usePlayerNews(playerName: string | null) {
  // Fetch from existing endpoints, filter by player last name
  // Cache results in component state
}
```

**Research Insights:**

**Architecture (CRITICAL):** `mlb-feed/routes.ts` is 1,498 lines with 17 endpoints — a god module. Do NOT add another endpoint here. If server-side aggregation is needed later, extract `mlb-feed/services/newsService.ts` first.

**Performance:** Use `Promise.allSettled()` for parallel feed fetches. Add in-memory cache with 10-minute TTL for RSS feeds (currently zero caching on RSS endpoints).

**Pattern Recognition:** 4 near-identical RSS parsing blocks exist (Yahoo, MLB.com, ESPN, Trade Rumors). Extract `parseRssFeed()` utility before adding any new news functionality.

**Security:** Validate RSS feed `link` values start with `https://` before rendering. A compromised feed could inject `javascript:` protocol links.

**Fuzzy Matching Best Practices:**
- Accent normalization: `str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")`
- Last name minimum: 5 chars (not 4 — reduces false positives like "Bell", "Cole")
- Full name match preferred over last-name-only
- Skip Fuse.js — RSS titles use correct spelling; simple `includes()` is more predictable

**Frontend Races (MEDIUM):** PlayerDetailModal already does `Promise.allSettled` with `cancelled` boolean but no `AbortController`. Adding a 6th fetch compounds this. Thread `AbortController.signal` through `fetchJsonApi` for proper cleanup on modal close.

**SpecFlow Gap:** Players without `mlbId` get no news (modal returns early at line 159). Show empty state rather than skipping entirely.

**Files to modify:**
- `client/src/hooks/usePlayerNews.ts` — new hook
- `client/src/components/shared/PlayerDetailModal.tsx` — add news section to Profile tab

**Acceptance Criteria:**
- [ ] PlayerDetailModal Profile tab shows "Recent News" with up to 5 articles
- [ ] Articles from all 5 existing feeds, filtered by player name
- [ ] Source labels (ESPN, Yahoo, Reddit, etc.) with relative dates
- [ ] Works for both NL and AL players
- [ ] Empty state: "No recent news" (not hidden)
- [ ] AbortController cancels fetches on modal close

---

#### ~~A3. AL Player News Inclusion~~ — ELIMINATED

Research confirmed: NO NL-only filter exists on news feeds. Reddit uses league-roster cross-referencing (not NL/AL based). Mark as complete after 2-minute verification. Zero code changes.

---

### Group B: Stats & Scoring

#### ~~B1. Forward-Compatible Stats for AL + H2H~~ — ELIMINATED (YAGNI)

No AL or H2H leagues exist. The `ScoringEngine` strategy pattern already supports Roto/H2H/Points. `CATEGORY_CONFIG` is league-type-agnostic. Do this audit when the first AL/H2H league is created.

---

#### B2. IL Replacement Accuracy — SP vs RP (#4)

**Problem:** Depth chart API returns all pitchers as "P". Blake Snell's replacement shows RP instead of SP.

**Solution (~10 lines):**
```typescript
// At mlb-feed/routes.ts:350-351
// Instead of exact position match, use SP/RP role heuristic
function classifyPitcherRole(gamesStarted: number, gamesPlayed: number): "SP" | "RP" | "P" {
  if (gamesPlayed < 3) return "P";  // Insufficient data
  return (gamesStarted / gamesPlayed >= 0.5) ? "SP" : "RP";
}
```

**Research Insights:**

**Best Practice:** GS/G >= 0.5 = SP is the industry standard (FanGraphs, Baseball Reference). Aggregate across teams for traded pitchers.

**SpecFlow Gap:** For pitchers with <3 games (early season), fall back to previous season stats or depth chart ordering.

**Files to modify:**
- `server/src/features/mlb-feed/routes.ts:337-361` — depth chart replacement logic

**Acceptance Criteria:**
- [ ] SP on IL shows SP replacement
- [ ] RP on IL shows RP replacement
- [ ] Fallback to generic "P" match if role unknown
- [ ] No regression on non-pitcher IL replacements

---

### Group C: UI Polish + Data Fix

#### C1. Position Sort on Remaining Pages (#5)

**Pre-requisite (Pattern Recognition, MEDIUM):** `POS_ORDER` diverges between client and server:
- Client: `["C","1B","2B","3B","SS","MI","CM","OF","P","DH"]` — no SP/RP
- Server: `["C","1B","2B","3B","SS","MI","CM","OF","SP","RP","P","DH"]` — includes SP/RP
- `mlb-feed/routes.ts:1072`: inline re-declaration with DH before P

Unify before implementing position sort. The server version (with SP/RP) is more correct for display.

**Important:** `SLOT_ORDER` in `Team.tsx:322` is **intentionally different** — it sorts by assigned roster slot (C, 1B, 2B, 3B, SS, MI, CM, OF, DH), not natural position. Do NOT replace with `POS_ORDER`.

**TypeScript (HIGH):** Team.tsx has `(a as any).assignedPosition` at line 326-333. Fix the player type — don't just swap sort arrays.

**Files to modify:**
- `client/src/lib/sports/baseball.ts:10` — add SP/RP to match server
- `client/src/features/ai/pages/DraftReportPage.tsx:141-165` — replace string sort with `POS_ORDER.indexOf()`
- `client/src/features/periods/pages/Season.tsx` — add per-player position sort
- `client/src/features/roster/components/AddDropTab.tsx` — add position sort column
- `server/src/features/mlb-feed/routes.ts:1072` — import `POS_ORDER` instead of re-declaring

**Acceptance Criteria:**
- [ ] Draft Report, Season, Add/Drop sorted by `POS_ORDER`
- [ ] Team page keeps `SLOT_ORDER` (intentional difference)
- [ ] Ohtani two-way split sorts correctly (DH with hitters, P with pitchers)
- [ ] `as any` casts removed from Team.tsx sort logic
- [ ] Inline `POS_ORDER` in mlb-feed removed — imports from sportConfig

---

#### C2 + E1. Fix TeamStatsSeason Fallback + Waiver Priority (MERGED)

**Problem:** Both items share the same root cause — `TeamStatsSeason` has all-zero data, making fallbacks useless.

**Simplified Solution (per Simplicity + Data Integrity Reviews):**
Replace 2 fallback queries with `TeamStatsPeriod` aggregation. **Skip the migration** — leave the table harmlessly in Postgres. No migration risk, ~10 lines changed.

**Data Integrity (CRITICAL):** `archiveExportService.ts:45` also reads `TeamStatsSeason` — not in original plan. Must update this file too.

**Additional consumers found (Data Integrity Review):**
| File | Line | Usage |
|------|------|-------|
| `waivers/routes.ts` | 237-246 | Waiver priority fallback |
| `teams/routes.ts` | 153-162 | AI insights fallback |
| `teams/services/teamService.ts` | 89 | Team detail query |
| `archive/services/archiveExportService.ts` | 45-51 | Archive export |
| `admin/routes.ts` | 183 | League reset cleanup |
| `seed.ts` | 122 | Seed data |

**Performance:** Replacement uses `computeTeamStatsFromDb()` which already computes correctly from `PlayerStatsPeriod`. For season aggregation, SUM counting stats (R, HR, RBI, SB, H, AB, W, S, K, ER, IP, BB_H) then derive rate stats (AVG from H/AB, ERA from ER/IP, WHIP from BB_H/IP). Do NOT average rates across periods.

**Waiver Priority Specifics:**
- When no completed period exists: use active period via `computeTeamStatsFromDb()`. If no period at all, equal priority for all teams (break ties by submission time).
- **SpecFlow Gap:** Tiebreaking when two teams have identical roto points is currently arbitrary. Document: use timestamp of most recent successful waiver claim as tiebreaker.

**Files to modify:**
- `server/src/features/waivers/routes.ts:237-246` — replace with `computeTeamStatsFromDb()`
- `server/src/features/teams/routes.ts:153-162` — replace with `computeTeamStatsFromDb()`
- `server/src/features/teams/services/teamService.ts:89` — remove `teamStatsSeason` from parallel query
- `server/src/features/archive/services/archiveExportService.ts:45` — replace with `TeamStatsPeriod` aggregation

**Acceptance Criteria:**
- [ ] Waiver priority uses `TeamStatsPeriod` via `computeTeamStatsFromDb()`
- [ ] AI insights uses same path
- [ ] Archive export updated
- [ ] Table left in schema (no migration)
- [ ] Tiebreaking documented

---

### Group D: Deployment

#### D1. Deploy to Railway

**Full Go/No-Go checklist produced by Deployment Verification Agent.** Key updates from research:

**Critical Update:** Railway now uses **Railpack** (not Nixpacks) as of March 2026. Nixpacks is deprecated.

**CSP Update:** `frameSrc` is currently EMPTY (`frameSrc: []`). Must add `https://www.youtube.com`, `https://www.youtube-nocookie.com`. This also fixes E2 (YouTube).

**WebSocket:** Code already uses `window.location.host` for WS connections — no hardcoded Render hostnames in WS hooks. Verified Railway-compatible.

**API_BASE:** `client/src/api/base.ts` has hardcoded check for `thefantasticleagues.com` hostname that returns Render URL. Must update to Railway domain.

**SQLite Cache Risk:** The shared MLB cache at `mcp-servers/mlb-data/cache/mlb-data.db` will be lost on Railway container restart (ephemeral filesystem). Options: (a) Railway persistent volume, (b) PostgreSQL cache table, (c) accept cold starts.

**Deployment Lessons Applied (from 6 past incidents):**
1. Set ALL `VITE_*` env vars BEFORE first build (past incident: Vite couldn't inject them)
2. Verify `NODE_ENV=production` explicitly (past incident: dev login exposed)
3. Purge Cloudflare cache immediately after DNS change
4. Verify SW cache headers: `curl -sI /sw.js | grep cache-control` → must show `no-cache`
5. Update OAuth callback URLs in Google, Yahoo, Supabase dashboards

**Security (P1):** Verify `NODE_ENV=production` is explicitly set in Railway. If it defaults to `development`, the dev login endpoint would be exposed (returns admin password in response body).

**Phased Deployment (from Deployment Verification Agent):**
1. Code prep + env vars in Railway
2. Railway as canary (Render still live)
3. Validation (health, auth, WebSocket, cron)
4. DNS cutover
5. Post-cutover verification
6. Decommission Render (48h after stable)

**Rollback:** If Railway fails after DNS cutover, revert Cloudflare DNS to Render CNAME (60s with short TTL). Keep Render as hot standby for 48h.

**Acceptance Criteria:**
- [ ] App deploys successfully on Railway via Railpack
- [ ] All API endpoints respond correctly
- [ ] WebSocket connections work (draft, auction)
- [ ] CSP headers allow YouTube, Railway domain, all external services
- [ ] Health check passes at `/api/health`
- [ ] All 4 cron jobs fire at least once (verify after 48h)
- [ ] `NODE_ENV=production` confirmed
- [ ] SW cache headers verified
- [ ] 0 console errors in browser DevTools

---

### Group E: P0 Fixes

#### E2. YouTube Videos Not Playing on Production (#18)

**Root Cause (confirmed by Deployment Learnings):** `frameSrc` in CSP is currently EMPTY (`frameSrc: []`). The YouTube domains need to be added.

**Solution (1-line fix):**
```typescript
// server/src/index.ts CSP config
frameSrc: ["'self'", "https://www.youtube.com", "https://youtube.com", "https://www.youtube-nocookie.com"]
```

**Additional Check:** Verify `X-Frame-Options` header (Helmet default) doesn't conflict with `frame-src`. Helmet's `frameguard` may set `SAMEORIGIN` which blocks YouTube iframes.

**SpecFlow Gap:** No fallback for ad blockers blocking YouTube iframe. Show a "Watch on YouTube" external link as fallback.

**Acceptance Criteria:**
- [ ] YouTube embeds play on production
- [ ] CSP `frameSrc` includes YouTube domains
- [ ] "Watch on YouTube" fallback link for blocked embeds

---

### Group F: P1 Features

#### F1. Test Add/Drop Flow (#11)

**HIGH-SEVERITY RACE CONDITIONS FOUND (Frontend Races Review):**

**Race 1: Rapid-fire add/drop.**
`handleClaim` in `ActivityPage.tsx:112` has NO loading flag. The Add buttons in `AddDropTab` are never disabled during submission. A commissioner can click "Add" twice before the first request returns, exceeding the 23-player roster limit. The server-side `assertRosterLimit` uses a point-in-time count that is stale by the time the second request runs.

**Fix (client):** Add `claimInFlight` state, disable buttons during submission.
**Fix (server):** Add `SELECT ... FOR UPDATE` on team row inside the transaction, matching the pattern trade processing already uses.

**Race 2: Waiver double-processing.**
`POST /waivers/process/:leagueId` has no idempotency guard. Two concurrent requests both find `status: "PENDING"` claims. The button is `disabled` client-side but that's advisory.

**Fix (server):** Postgres advisory lock: `SELECT pg_try_advisory_xact_lock(hashtext('waiver_process_' || leagueId))`. Return 409 if lock not acquired.

**SpecFlow Gap:** No drop-player picker in Add/Drop flow. `handleClaim` never passes `dropPlayerId`. Commissioner must drop separately, leaving a window where roster exceeds limit.

**SpecFlow Gap:** Commissioner add/drop bypasses budget system entirely (`POST /api/transactions/claim` creates roster entry with no price deduction). May be intentional but undocumented.

**Security (IDOR, P1):** Commissioner roster assign at `commissioner/routes.ts:676-713` has NO verification that `teamId` belongs to the route's `leagueId`. A commissioner in League A could assign players to teams in League B. The roster EDIT endpoint at line 775 already has the correct pattern: `if (!roster || roster.team.leagueId !== leagueId)`. Replicate this guard.

**Test Plan:**
1. Login as commissioner
2. Navigate to Activity page → Add/Drop tab
3. Add player, verify roster entry created
4. Drop player, verify `releasedAt` set
5. Verify transaction appears in Activity tab
6. Test rapid double-click (should be blocked by in-flight guard)
7. Test as non-commissioner (should see Waiver Claim form)

**Acceptance Criteria:**
- [ ] Add/drop works end-to-end in browser
- [ ] In-flight guard prevents rapid double-submission
- [ ] Waiver processing has advisory lock against double-processing
- [ ] Commissioner roster assign validates teamId belongs to leagueId
- [ ] Transaction recorded in activity log
- [ ] Non-commissioner sees waiver form

---

### Group G: P2 Future-Facing

#### G1-G3. Trade Asset Processing — VERIFY UI ONLY

**Backend is already done (per Simplicity Review).** All 5 asset types have processing logic:
- `PLAYER` (lines 418-446): full roster move
- `BUDGET` (lines 448-456): immediate transfer
- `FUTURE_BUDGET` (lines 462-467): validates + logs (NO enforcement — see below)
- `WAIVER_PRIORITY` (lines 468-480): swaps overrides
- `PICK` (lines 481-483): validates + logs (informational)

**CRITICAL (Data Integrity):** `FUTURE_BUDGET` is a broken promise. Trades are accepted but the budget adjustment is NEVER applied to a future season. Either:
(a) Add `applyFutureBudgetTrades(leagueId, season)` in `seasonService.transitionTo("DRAFT")` using the `FinanceLedger` model, or
(b) Mark as "informational only" in the UI and document the limitation.

**Pattern Recognition:** Trade reversal at lines 634-665 only reverses PLAYER and BUDGET — silently ignores WAIVER_PRIORITY (swap not undone) and PICK/FUTURE_BUDGET.

**SpecFlow Gap:** TradeAssetSelector has FUTURE_BUDGET input and WAIVER_PRIORITY buttons but NO PICK selection UI (no round/season picker). Must add for G1 completion.

**SpecFlow Gap:** WAIVER_PRIORITY "rounds" UI (1st/2nd/3rd Round buttons) has no backend mapping — the FAAB system has no rounds concept. The server only uses `waiverPriorityOverride` integer. Either add backend support or simplify to a single toggle.

**TypeScript (LOW):** Convert `tradeItemSchema` from flat `.refine()` to `z.discriminatedUnion("assetType", [...])` for proper type narrowing. Eliminates 6 `as any` casts in processing code.

**Acceptance Criteria:**
- [ ] Verify PICK/FUTURE_BUDGET/WAIVER_PRIORITY trades display in trade history
- [ ] Add PICK selection UI (round + season picker) to TradeAssetSelector
- [ ] Decide: FUTURE_BUDGET enforcement or "informational only" label
- [ ] Decide: WAIVER_PRIORITY persistence (one-time or permanent?)
- [ ] Document: trade reversal does NOT undo WAIVER_PRIORITY swaps

---

#### ~~G4. Top 100 Prospects~~ — ELIMINATED (Already Implemented)

`syncAAARosters()` at `mlbSyncService.ts:485+` already syncs ALL AAA rosters weekly (Monday 14:00 UTC cron). This is a superset of "top 100 prospects." `POST /api/admin/sync-prospects` exists for on-demand triggering.

---

#### G5. Pre-Draft Trade History (#9) — One-Time Script

Devil Dawgs traded Cedric Mullins + $75 to DLC for Kyle Tucker. One Prisma script, ~15 lines, 5 minutes.

---

#### G6. De-Emphasize Auction Prices IN_SEASON (#10) — CSS Only

Conditional className: if `seasonStatus === "IN_SEASON"`, apply `text-xs text-muted` to price cells. ~5 lines per page. `useSeasonGating()` hook already provides season status.

---

#### ~~G7. Verify Scoring/Standings~~ — ELIMINATED (QA Only)

10-minute browser check: open standings page, compare with expected values.

---

#### ~~G8. Regenerate Draft Report~~ — ELIMINATED (One Button Click)

The "Generate Draft Report" feature already exists. Click the button.

---

## Cross-Cutting Concerns (from 12 review agents)

### TypeScript — Blocking Issues

| Item | Issue | Severity |
|------|-------|----------|
| A1 | `enrichStalePlayers` must NOT return `any[]`. Use `mlbGetJson<T>()` generic. | HIGH |
| C1 | Team.tsx uses `as any` for player fields (line 326-333). Fix the type. | HIGH |
| C2 | Run `npx tsc --noEmit` after changes to catch all `TeamStatsSeason` consumers. | HIGH |
| C1 | `POS_ORDER` diverges client vs server. Unify before position sort. | MEDIUM |

### Performance — Action Items

| Item | Issue | Fix |
|------|-------|-----|
| A2 | RSS feeds have zero server-side caching | Add 10-min TTL in-memory cache |
| A2 | 5 feeds fetched serially per request | Use `Promise.allSettled()` for parallel |
| C2 | Rate stats aggregation | SUM components (H/AB, ER/IP), derive rates — do NOT average |
| D1 | SQLite cache lost on Railway restart | Use persistent volume or accept cold starts |
| General | `syncAllPlayers` does ~1,200 individual `prisma.player.update()` | Batch with `prisma.$transaction()` (future improvement) |

### Security — Risk Matrix

| ID | Finding | Severity | Priority |
|----|---------|----------|----------|
| F1-IDOR | Commissioner roster assign lacks league cross-check | MEDIUM | P1 |
| A2-RSS | RSS feed `link` URLs not validated (`javascript:` risk) | MEDIUM | P1 |
| D1-ENV | Railway NODE_ENV misconfiguration exposes dev login | MEDIUM | P1 |
| G-SELF | Trade self-dealing between owned teams | MEDIUM | P2 |
| F1-RACE | Add/drop rapid-fire can exceed roster limit | HIGH | P1 |
| E1-RACE | Waiver double-processing (no advisory lock) | HIGH | P1 |

### Frontend Races — Summary

| Item | Severity | Issue | Fix |
|------|----------|-------|-----|
| E1 (Waiver) | **HIGH** | No idempotency guard — concurrent processing | Advisory lock on server |
| F1 (Add/Drop) | **HIGH** | No in-flight guard — roster limit bypass | Client: disabled state. Server: `FOR UPDATE` |
| A2 (Modal) | LOW | No AbortController — requests continue after close | Thread `signal` through fetchJsonApi |
| Home (News) | MEDIUM | 12 useEffects, no cancellation, league-switch stale data | Extract `useFetchOnMount` hook |

### Architecture — Key Recommendations

1. **Before A2:** Do NOT add to `mlb-feed/routes.ts` (1,498 lines). Use client-side aggregation or extract `newsService.ts` first.
2. **C2 + E1 = single work unit.** Same root cause, same fix.
3. **G1-G3:** No strategy pattern needed. 5 asset types, 3 trivial — inline if/else is clearer.
4. **B1:** Scoring engine already supports H2H/Points. Position sort is the actual work, not scoring architecture.

---

## Revised Dependencies

```
A1 (Austin Riley) → independent, do first
A2 (News Links) → independent (client-side approach)
B2 (IL accuracy) → independent
C1 (Position sort) → unify POS_ORDER first
C2+E1 (TeamStatsSeason) → single work unit
D1 (Railway) → independent, includes E2 fix (CSP)
E2 (YouTube) → included in D1 (CSP frameSrc)
F1 (Add/Drop) → independent, fix race conditions
G1-G3 (Trade UI) → verify + PICK UI
G5 (Pre-draft trade) → one-time script
G6 (De-emphasize prices) → CSS only
```

## Revised Sequence

1. **A1** — Austin Riley enrichment (one-time script/endpoint)
2. **A2** — Player news in modal (client-side hook)
3. **B2** — IL replacement SP/RP fix (~10 lines)
4. **C1** — Position sort on 4 pages (unify POS_ORDER first)
5. **C2+E1** — Fix TeamStatsSeason fallback + waiver priority
6. **F1** — Test add/drop + fix race conditions (HIGH priority)
7. **E2+D1** — YouTube CSP fix + Railway deployment
8. **G1-G3** — Verify trade asset UI, add PICK selector
9. **G5, G6** — One-time script + CSS changes

## Sources & References

### Internal References
- Player sync: `server/src/features/players/services/mlbSyncService.ts:214-246`
- News feeds: `server/src/features/mlb-feed/routes.ts:196-825` (1,498 lines — god module)
- PlayerDetailModal: `client/src/components/shared/PlayerDetailModal.tsx:389-408`
- Waiver priority: `server/src/features/waivers/routes.ts:210-246`
- Trade processing: `server/src/features/trades/routes.ts:417-484`
- Railway config: `railway.json`
- CSP config: `server/src/index.ts:85-120`
- API_BASE: `client/src/api/base.ts:4-14`

### Institutional Learnings Applied
- `docs/solutions/logic-errors/ai-grading-zero-data-random-standings.md` — validate data content, not row existence (C2)
- `docs/solutions/logic-errors/waiver-priority-league-and-sort-fix.md` — explicit leagueId, ascending sort (E1)
- `docs/solutions/deployment/QUICK-REFERENCE.md` — pre-deploy 5-minute checklist (D1)
- `docs/solutions/deployment/csp-websocket-and-cdn-issues.md` — CSP `frameSrc` was empty (E2)
- `docs/solutions/deployment/hardcoded-api-paths-cloudflare-cache-bypass.md` — API_BASE hostname check (D1)
- `docs/solutions/runtime-errors/service-worker-blocking-external-resources.md` — SW must skip cross-origin (D1)
- `docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md` — audit after trades (G1-G3)
- `docs/solutions/api-changes/mlb-api-recent-stats-deprecation.md` — label at call time (A2)
- `docs/solutions/ui-bugs/auction-ux-position-dropdown-ohtani-stats-api-migration.md` — positionToSlots not hardcoded (C1)

### External Research
- Railway Railpack docs (replaces Nixpacks as of March 2026)
- MLB Stats API `people?personIds=` batch endpoint for player enrichment
- GS/G >= 0.5 industry standard for SP classification (FanGraphs, Baseball Reference)
- Prisma expand-and-contract migration pattern

---

## Round 2: Implementation-Level Details (from 9 deep-dive agents)

### A1 Implementation Blueprint

**Austin Riley MLB ID:** 663586 (from `2024_mlb_ids.csv`)

**Exact guard logic to replicate** (`mlbSyncService.ts:241`):
```typescript
const shouldUpdatePosList = !existingPosList || existingPosList === existing.posPrimary || existingPosList === posAbbr;
```
Only updates `posList` when: (1) missing, (2) not enriched (equals primary), (3) matches new API position.

**`fetchPlayerBatch()` pattern** (line 280-295): chunks `mlbIds` into groups of 50, calls `people?personIds=X,Y,Z&hydrate=currentTeam`, 100ms inter-batch delay. Returns flat `any[]` (use generic instead).

**`resolvePosition()` flow** (lines 29-40): checks `TWO_WAY_PLAYERS` map → `POSITION_OVERRIDES` map → returns raw position. Current overrides: `{ 660271 → "DH" }` (Ohtani hitter).

**Admin endpoint pattern** (from `admin/routes.ts:328-342`):
```typescript
router.post("/admin/enrich-stale-players", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const result = await enrichStalePlayers(season);
  writeAuditLog({ userId: req.user!.id, action: "STALE_PLAYER_ENRICHMENT", resourceType: "Player", metadata: result });
  return res.json({ success: true, ...result });
}));
```

---

### A2 Implementation Blueprint

**Response shapes from each feed:**
- **Trade Rumors**: `{ items: [{ title, link, pubDate, categories: string[] }] }` — categories contain player/team names
- **Reddit**: `{ posts: [{ title, url, permalink, score, numComments, createdUtc, matchedPlayers: [{ name, fantasyTeam }] }] }` — server-side cross-referencing
- **Yahoo/MLB/ESPN**: `{ articles: [{ title, link, pubDate, description }] }` — identical shapes

**Client-side cross-referencing algorithm** (Home.tsx:1586-1593):
```typescript
const lowerTitle = (a.title || "").toLowerCase();
for (const [key, team] of leagueRoster) {
  if (key.length >= 4 && lowerTitle.includes(key))
    matched.push({ name: key, fantasyTeam: team });
}
```

**Existing `getPlayerNews()` in api.ts** (lines 498-508) fetches MLB TRANSACTIONS (not news articles). The name is misleading — it returns `PlayerTransaction[]`. A new hook is needed for RSS feed news.

**Best insertion point in PlayerDetailModal:** After line 386 (Recent Transactions section), before External Links (line 389). Same section styling pattern.

**Hook template:** `useRosterStatus` at `client/src/hooks/useRosterStatus.ts:14-38` — uses `ok` boolean for cleanup, `URLSearchParams` for query building, loading/data/error states.

---

### B2 Implementation Blueprint — KEY CORRECTION

**The depth chart API DOES return differentiated position codes:**
- Starting Pitchers: `position.abbreviation = "SP"`
- Closers: `position.abbreviation = "CP"`
- Relief Pitchers: `position.abbreviation = "P"`

**The real issue:** The INJURED player's position comes from the **40-man roster API** (line 296), which returns generic `"P"` for ALL pitchers. So when searching the depth chart for a replacement, `"P" === "SP"` fails.

**Fix:** When the injured player's position is `"P"`, search depth chart for ANY pitcher type (`"P"`, `"SP"`, `"CP"`), then prefer role-matched replacements:
```typescript
// Replace exact match at line 350-351
const isPitcherPos = (pos: string) => ["P", "SP", "RP", "CP", "CL"].includes(pos);
const samePos = isPitcherPos(ip.position)
  ? dcRoster.filter(d => isPitcherPos(d.position.abbreviation) && d.person.id !== ip.mlbId && !d.status.description.includes("Injured"))
  : dcRoster.filter(d => d.position.abbreviation === ip.position && d.person.id !== ip.mlbId && !d.status.description.includes("Injured"));
```

---

### C1 Implementation Blueprint

**CRITICAL CORRECTION: Season.tsx is NOT applicable.** It shows team standings (NormalizedSeasonRow with teamName, totalPoints), NOT player lists. No position field exists. Remove from the plan.

**Actual pages needing fixes: 3 (not 4):**

| Page | Position Field | Data Shape | Fix Needed |
|------|---------------|------------|------------|
| DraftReportPage | `position` (single string) | `RosterEntry.position` | Replace string sort with `POS_ORDER.indexOf(r.position)` |
| AddDropTab | `positions` (CSV) | `PlayerSeasonStat.positions` | Add position as sortable column header |
| Team.tsx | `assignedPosition` | `(a as any).assignedPosition` | Fix type, keep SLOT_ORDER (intentional) |

**DraftReportPage fix** (lines 141-159): Currently sorts by raw string (`case "pos": return r.position`). Replace with:
```typescript
case "pos": {
  const ia = POS_ORDER.indexOf(a.position);
  const ib = POS_ORDER.indexOf(b.position);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
}
```

**AddDropTab fix** (lines 128-151): Add `"pos"` to sort keys, add SortableHeader for position column.

**Team.tsx type fix** (lines 326-333): The `as any` casts exist because `PlayerSeasonStat` type doesn't define `assignedPosition`. The merged object at line 174-240 adds it but the type doesn't reflect it. Fix by extending the type inline.

---

### C2+E1 Implementation Blueprint

**Full consumer list (8 files):**

| File | Lines | Replacement |
|------|-------|-------------|
| `waivers/routes.ts` | 237-246 | Aggregate all `TeamStatsPeriod` via `findMany` with `periodId IN (...)`, sum counting stats |
| `teams/routes.ts` | 154-162 | Use `computeTeamStatsFromDb(leagueId, lastCompletedPeriodId)` |
| `teams/services/teamService.ts` | 89-91 | Query active period's `TeamStatsPeriod` or return null |
| `archive/services/archiveExportService.ts` | 45-74 | Most complex: aggregate all periods + `computeStandingsFromStats()` for final rankings |
| `admin/routes.ts` | 183 | Delete the `teamStatsSeason.deleteMany` line |
| `seed.ts` | 122 | Delete the `teamStatsSeason.upsert` block |
| `admin/__tests__/routes.test.ts` | 20 | Remove from prisma mock |
| `prisma/schema.prisma` | 306, 505-526 | Skip migration — leave table, just remove code references |

**Waiver fallback replacement** (optimized single query):
```typescript
const allPeriods = await prisma.period.findMany({
  where: { season: { leagueId } }, select: { id: true },
});
const periodStatsList = await prisma.teamStatsPeriod.findMany({
  where: { periodId: { in: allPeriods.map(p => p.id) } },
  select: { teamId: true, R: true, HR: true, RBI: true, SB: true, W: true, S: true, K: true },
});
const strengthMap = new Map<number, number>();
for (const stat of periodStatsList) {
  strengthMap.set(stat.teamId, (strengthMap.get(stat.teamId) ?? 0) + stat.R + stat.HR + stat.RBI + stat.SB + stat.W + stat.S + stat.K);
}
```

---

### F1 Implementation Blueprint

**Exact race condition location:** `transactions/routes.ts:98-105` checks player availability OUTSIDE the transaction. Lines 112-164 start the transaction too late — the race window is already open.

**Assertion functions in `lib/rosterGuard.ts`:**
- `assertPlayerAvailable` (lines 15-39): uses `findFirst` — NO `FOR UPDATE`
- `assertRosterLimit` (lines 48-66): uses `roster.count` — NO `FOR UPDATE`

**Gold standard pattern to replicate** (`trades/routes.ts:410-412`):
```typescript
const locked = await tx.$queryRaw<{ status: string }[]>`
  SELECT status FROM "Trade" WHERE id = ${id} FOR UPDATE
`;
```

**Client-side fix** (`ActivityPage.tsx:112-138`): No loading state exists. Add:
```typescript
const [claimInFlight, setClaimInFlight] = useState(false);
const handleClaim = async (player: PlayerSeasonStat) => {
  if (claimInFlight) return;
  setClaimInFlight(true);
  try { /* ...existing logic */ } finally { setClaimInFlight(false); }
};
```

**AddDropTab buttons** (lines 273-290): No `disabled` attribute. Pass `claimInFlight` down as prop, disable buttons when true.

**Waiver advisory lock:**
```typescript
const lockAcquired = await tx.$queryRaw<{pg_try_advisory_xact_lock: boolean}[]>`
  SELECT pg_try_advisory_xact_lock(hashtext(${'waiver_process_' + leagueId}))
`;
if (!lockAcquired[0]?.pg_try_advisory_xact_lock) {
  return res.status(409).json({ error: "Waiver processing already in progress" });
}
```

---

### D1+E2 Implementation Blueprint — KEY CORRECTIONS

**CSP already has YouTube in `frameSrc`!** Deep dive found:
```typescript
frameSrc: ["'self'", "https://accounts.google.com", "https://www.youtube.com", "https://youtube.com", "https://www.youtube-nocookie.com", "https://www.google.com"]
```
This contradicts earlier research claiming `frameSrc: []`. The YouTube issue is NOT CSP-related. Check instead:
- `X-Frame-Options` header (Helmet default may conflict)
- Actual embed URL format
- Browser console for the real error

**No hardcoded `onrender.com` in active code.** All references are in docs or env examples. WebSocket hooks use `window.location.host` — already Railway-compatible.

**Nearly zero-code migration.** Key items:
1. Set `VITE_*` env vars BEFORE first Railway build
2. Set `NODE_ENV=production` explicitly
3. Update CSP `connectSrc` with Railway domain for `wss://`
4. Update OAuth callback URLs in Google/Yahoo/Supabase dashboards
5. `VITE_WS_HOST` in `render.yaml` is NOT used in code — can be deleted

**`API_BASE` resolution** (`base.ts:4-14`): Falls back to `"/api"` when `VITE_API_BASE` is unset. For unified Railway deployment (frontend+backend same domain), leave `VITE_API_BASE` unset — relative `/api` paths work automatically.

---

### G1-G3 Implementation Blueprint — KEY CORRECTION

**FUTURE_BUDGET IS applied during season transition!** Deep dive found code in `seasonService.ts:64-80`:
```typescript
const futureBudgetItems = await prisma.tradeItem.findMany({
  where: { assetType: "FUTURE_BUDGET", season: season.year, trade: { leagueId, status: "PROCESSED" } }
});
for (const item of futureBudgetItems) {
  await prisma.team.update({ where: { id: recipientId }, data: { budget: { increment: amt } } });
  await prisma.team.update({ where: { id: senderId }, data: { budget: { decrement: amt } } });
}
```
Earlier reviews claiming "broken promise" were incorrect. FUTURE_BUDGET works — it's just deferred to season transition.

**UI status after deep dive:**

| Asset Type | UI Selector | Display in History | Gap |
|------------|-------------|-------------------|-----|
| PLAYER | Full roster picker | Shows name+pos | None |
| BUDGET | **MISSING** | Shows "$X Waiver Budget" | Need budget input |
| FUTURE_BUDGET | Amount+Season inputs | Shows "$X of {year} Draft Budget" | None |
| WAIVER_PRIORITY | Round buttons (1st/2nd/3rd) | Shows "Waiver Priority Position" (no round!) | Round not displayed |
| PICK | **MISSING** | Shows "Round X Draft Pick" | Need round+season picker |

**Trade reversal gaps:** FUTURE_BUDGET, WAIVER_PRIORITY, PICK are silently ignored during reversal.

---

### G5 Implementation Data

**Team IDs:** Devil Dawgs = code `DD2`, DLC = code `DLC` (look up actual IDs from DB)
**Player MLB IDs:** Cedric Mullins = 656775, Kyle Tucker = 663656
**Trade creation pattern** (from `trades/routes.ts:147-224`):
```typescript
await prisma.trade.create({
  data: {
    leagueId: 20, proposerId: devilDawgsTeamId, status: "PROCESSED", processedAt: new Date("2026-03-15"),
    items: { create: [
      { senderId: ddId, recipientId: dlcId, assetType: "PLAYER", playerId: mullinsId },
      { senderId: ddId, recipientId: dlcId, assetType: "BUDGET", amount: 75 },
      { senderId: dlcId, recipientId: ddId, assetType: "PLAYER", playerId: tuckerId },
    ] },
  },
});
```

### G6 Price Display Locations

| Location | File | Line | Current Class |
|----------|------|------|---------------|
| Team Roster View | `TeamRosterView.tsx` | 60 | `text-amber-500` |
| Team List Tab (auction) | `TeamListTab.tsx` | 316 | `text-[var(--lg-accent)]` |
| Team Page roster | `Team.tsx` | 549 | `text-[10px] text-[var(--lg-text-muted)]` |

**Season status access:** `const { seasonStatus } = useLeague()` or `const { canViewAuctionResults } = useSeasonGating()`
**De-emphasis pattern:** `className={seasonStatus === "IN_SEASON" ? "text-[10px] opacity-40" : "text-amber-500"}`
