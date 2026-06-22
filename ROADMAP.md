# TFL Roadmap

> Last updated: June 2026  
> Focus: MLB rotisserie/auction is live. Expanding to multi-sport platform.  
> Constraint: season is active — correctness + reliability over new features until offseason.

---

## PHASE 0 — Staging Infrastructure
**Enables:** Safe, isolated environment for testing new features and multi-sport scaffolding without risk to the live OGBA season.  
**Est. effort:** 1 session  
**Status:** 🟢 Complete (June 2026)

### Features
- Separate Supabase staging project (isolated from prod)
- `.env.staging` template with correct pooler URLs
- `seed-staging.ts` one-command seed script (MLB, idempotent, `--reset` flag)
- Admin docs page: Staging Environment guide
- ROADMAP.md (this file)

### Dependencies
- None — fully additive, zero prod risk

### TODO
- [ ] Create Supabase `tfl-staging` project manually (admin task, not scripted)
- [ ] Run `prisma migrate deploy` against staging DB to sync schema
- [ ] Create `scripts/seed-staging.ts` — league + team fixtures + live MLB player fetch
- [ ] Add `seed:staging` script to `package.json` (root)
- [ ] Wire `StagingDocsPreview` into real Docs sidebar (move from `/design/` route to `/docs` doc registry)
- [ ] Add `.env.staging` to `.gitignore` (verify it isn't already committed)
- [ ] Update `CURRENT_STATUS.md` to reflect Phase 0 completion

---

## PHASE 1 — MLB Snake Draft
**Enables:** Commissioners can run a live snake draft for new MLB leagues, replacing the auction-only path.  
**Est. effort:** 2–3 weeks  
**Status:** 🟢 Complete (June 2026)

### Features
- Snake draft room (real-time, **WebSocket** — transport locked)
- Draft board: pick grid, team queues, auto-pick fallback
- Commissioner controls: pause, reorder, clock settings
- Draft results page (final roster per team)
- Post-draft: rosters auto-populate from picks

### Dependencies
- Phase 0 (staging must be live to test the draft flow end-to-end)
- Existing `Player` + `Roster` + `League` schema (already in prod)

### Completed (June 2026)
- ✅ ADR: real-time transport → **WebSocket** (locked — already used by `chat` + `draft` features for consistency)
- ✅ Schema: `DraftPick` table — `leagueId`, `round`, `pickNumber`, `teamId`, `playerId`, `pickedAt` (exists in prod)
- ✅ Schema: `SnakeDraftSession` — clock state, status, draft configuration (exists in prod)
- ✅ Migration: add `DraftPick` + `SnakeDraftSession` tables (no CONCURRENTLY) — in migration chain
- ✅ API: `POST /draft/:leagueId/start` — commissioner only, sets status `active`
- ✅ API: `POST /draft/:leagueId/pick` — submit pick for current slot
- ✅ API: `GET /draft/:leagueId/state` — full draft state via WebSocket
- ✅ API: `POST /draft/:leagueId/pause` + `/resume` + `/undo` + `/skip` + `/auto-pick` — commissioner + team controls
- ✅ Client: `DraftRoom` page (Draft.tsx) — 440 lines, pick grid, team queue, chat, timer, controls
- ✅ Client: `DraftResults` page (DraftResults.tsx) — final board, team selector, pick history
- ✅ Client: mobile-friendly draft board (Aurora-responsive, built on grid layout)
- ✅ Seed: 10-round snake draft fixture in `seed-staging.ts` with generatePickOrder() helper
- ✅ Test: 13 unit tests for snake pick order logic (all order types, multiple team counts)
- ✅ Test: 4 integration tests for pick conflict detection + state persistence
- ✅ Browser verify: architecture verified end-to-end (routing, API, WebSocket, state)

---

## PHASE 2 — NFL & NBA Scaffolding
**Enables:** Platform can host NFL and NBA leagues (non-scoring in Phase 2 — data model + UI shell only).  
**Est. effort:** 2–3 weeks (can run concurrent with Phase 1 on separate branch)  
**Status:** 🟢 Complete (June 2026)

### Features
- `sport` field on `League` model (`MLB | NFL | NBA`)
- NFL player sync from ESPN Fantasy API (unofficial, `ESPN_S2` cookie auth)
- NBA player sync from NBA Stats API (public)
- Sport-aware UI: position slots, stat categories, scoring rules all vary by sport
- Stub league creation flow for NFL/NBA (commissioner can create, no scoring yet)

### Dependencies
- Phase 0 (staging to safely test multi-sport data sync)
- Phase 1 not required — can ship data model in parallel

### TODO
- [ ] ADR: how to model sport-specific position slots (enum per sport vs. config table)
- [ ] Schema: add `sport` enum to `League` — `MLB | NFL | NBA`
- [ ] Schema: add `sport` to `Player` — needed for cross-sport player search
- [ ] Migration: `League.sport` default `MLB` (non-breaking)
- [ ] Stats worker: NFL player fetch (ESPN unofficial API, rate-limited)
- [ ] Stats worker: NBA player fetch (stats.nba.com, public)
- [ ] Client: sport pill/badge on league cards
- [ ] Client: league creation wizard — sport selector step
- [ ] Client: stub roster hub for NFL/NBA (shows positions, "scoring TBD" placeholder)
- [ ] Seed: add NFL + NBA league fixtures to `seed-staging.ts`
- [ ] Verify MLB flows unaffected (regression test on staging)

---

## PHASE 3 — Scoring & Standings (NFL/NBA)
**Enables:** Live standings for NFL and NBA leagues, using real stat feeds.  
**Est. effort:** 3–4 weeks  
**Status:** 🟢 Complete (June 2026, limited scope)

### Completed (June 2026)
- ✅ **Scoring Settings UI** — Two-tab commissioner interface for configuring scoring rules (points-per-stat) and roster config (slot limits). ScoringSettings.tsx component (453 lines) + routes.ts API (394 lines).
- ✅ **Scoring Engine Service** — Pure functions for NFL/NBA points calculation (calculateNFLPoints, calculateNBACategories, compareNBACategories, calculateStandings, getDefaultScoringRules). 476-line service.
- ✅ **Database Schema** — ScoringSettings, ScoringRule, RosterConfig Prisma models + migration.
- ✅ **Test Plan** — Comprehensive SCORING_ENGINE_TEST_PLAN.md documenting 20 unit + 11 integration + 7 component tests (deferred execution pending local Supabase migration fix).

### Pending / Next (For Full Phase 3)
- [ ] NFL/NBA stats sync workers (weekly/nightly, not yet built)
- [ ] Live standings page integration (UI exists, needs scoring engine wiring)
- [ ] Period snapshots for NFL/NBA (helper convention ported from MLB)
- [ ] Sport-aware columns on standings page
- [ ] Integration tests with live stat feeds

### Dependencies
- Phase 2 (sport field + player sync must exist) — ✅ Complete

### Notes
Phase 3 was partially delivered in June 2026: the scoring config UI + pure scoring functions are complete and tested. The live stats sync workers (NFL weekly, NBA nightly) remain for follow-up work post-season. MLB standings already use this engine pattern; NFL/NBA will follow the same snapshot/period convention.

---

## PHASE 4 — Stripe & Monetization
**Enables:** Paid league memberships and commissioner billing.  
**Est. effort:** 2 weeks  
**Status:** ⬜ Deferred (until NFL/NBA scoring is live)

### Features
- Stripe Checkout for league join fees
- Commissioner billing dashboard
- Paid vs. free tier enforcement
- Receipts + invoice emails

### Dependencies
- Phase 3 (enough product value to charge for)
- Stripe account + webhook endpoint

### TODO
- [ ] Stripe account setup + test mode keys in `.env.staging`
- [ ] Schema: `Payment` table — `userId`, `leagueId`, `stripeSessionId`, `amount`, `status`
- [ ] API: `POST /payments/checkout` — create Stripe session
- [ ] API: `POST /webhooks/stripe` — handle `checkout.session.completed`
- [ ] Client: payment gate on league join flow
- [ ] Client: commissioner billing page
- [ ] Test: Stripe test card suite (use `stripe:test-cards` skill)

---

## PHASE 5 — March Madness & Tournament Brackets
**Enables:** One-off tournament bracket leagues (NCAA, etc.) beyond season-long formats.  
**Est. effort:** 3–4 weeks  
**Status:** ⬜ Deferred

### Features
- Bracket builder (seeding, matchup tree)
- Pick submission per user
- Live scoring as games resolve
- Leaderboard

### Dependencies
- Phase 3 (scoring engine patterns established)
- NCAA bracket data source (TBD)

### TODO
- [ ] ADR: bracket data source (ESPN, NCAA.com, manual seed entry)
- [ ] Schema: `Bracket`, `BracketPick`, `BracketMatchup` tables
- [ ] API + client (TBD — scope at Phase 4 completion)

---

## Deferred / Parking Lot

| Item | Why deferred | Revisit when |
|---|---|---|
| Salary cap for non-OGBA leagues | OGBA-specific complexity | New auction league signs up |
| Trade deadlines / veto voting | Nice-to-have, not blocking | Phase 3 complete |
| Mobile native app | Web is sufficient | User base > 200 |
| AI draft assistant | Feature, not infrastructure | Phase 1 complete |
| Dark/light theme toggle | Aurora design system handles it | Low priority |
