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
**Status:** ⬜ Next

### Features
- Snake draft room (real-time, **WebSocket** — transport locked)
- Draft board: pick grid, team queues, auto-pick fallback
- Commissioner controls: pause, reorder, clock settings
- Draft results page (final roster per team)
- Post-draft: rosters auto-populate from picks

### Dependencies
- Phase 0 (staging must be live to test the draft flow end-to-end)
- Existing `Player` + `Roster` + `League` schema (already in prod)

### TODO
- [x] ADR: real-time transport → **WebSocket** (locked — already used by `chat` + `draft` features for consistency)
- [ ] Schema: `DraftPick` table — `leagueId`, `round`, `pickNumber`, `teamId`, `playerId`, `pickedAt`
- [ ] Schema: `DraftSession` — clock state, status (`pending | active | paused | complete`)
- [ ] Migration: add `DraftPick` + `DraftSession` tables (no CONCURRENTLY)
- [ ] API: `POST /draft/:leagueId/start` — commissioner only, sets status `active`
- [ ] API: `POST /draft/:leagueId/pick` — submit pick for current slot
- [ ] API: `GET /draft/:leagueId/board` — full board state (SSE or polling endpoint)
- [ ] API: `POST /draft/:leagueId/pause` + `/resume` — commissioner controls
- [ ] API: `POST /draft/:leagueId/auto-pick` — picks highest-ranked available player
- [ ] Client: `DraftRoom` page — pick grid, team queue sidebar, clock
- [ ] Client: `DraftResults` page — final board, filter by team
- [ ] Client: mobile-friendly draft board (read-only OK for mobile v1)
- [ ] Seed: add 10-round snake draft fixture to `seed-staging.ts`
- [ ] Test: unit tests for snake pick order (even/odd round reversal)
- [ ] Test: pick conflict guard (same player picked twice → error)
- [ ] Browser verify on staging before prod deploy

---

## PHASE 2 — NFL & NBA Scaffolding
**Enables:** Platform can host NFL and NBA leagues (non-scoring in Phase 2 — data model + UI shell only).  
**Est. effort:** 2–3 weeks (can run concurrent with Phase 1 on separate branch)  
**Status:** ⬜ Not Started

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
**Status:** ⬜ Not Started

### Features
- Sport-specific scoring config (points-per-stat, rotisserie categories, H2H)
- NFL weekly scoring (QB passing yards, TDs, RB rushing, WR receiving, etc.)
- NBA rotisserie categories (PTS, REB, AST, STL, BLK, FG%, FT%, 3PM, TO)
- Standings page adapts to sport
- Period snapshots for NFL/NBA (same snapshot helper convention as MLB)

### Dependencies
- Phase 2 (sport field + player sync must exist)

### TODO
- [ ] ADR: scoring config schema — per-league JSON config vs. typed enum presets
- [ ] Schema: `ScoringConfig` table or JSONB column on `League`
- [ ] API: scoring engine per sport (extract MLB engine into shared interface)
- [ ] NFL stats sync worker (weekly)
- [ ] NBA stats sync worker (nightly)
- [ ] Standings page: sport-aware column rendering
- [ ] Period snapshots for NFL/NBA

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
