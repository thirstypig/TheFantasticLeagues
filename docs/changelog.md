# Changelog

All notable changes to The Fantastic Leagues will be documented in this file.

## v2.2.1 — 2026-08-03 — fix
### Traded players' stats were being silently dropped

- **Fix:** When a player was traded between MLB teams in the middle of a scoring period, FBST recorded only his **first** team's partial line — sometimes zero. Curtis Mead's entire Period 5 was stored as zeros while he actually played 15 games (11 R, 3 HR, 9 RBI, 2 SB). Two players were affected across the season; both periods have been re-synced. Demolition Lumber Co.'s totals gained 11 R / 3 HR / 9 RBI / 2 SB and now match OnRoto exactly. **Standings moved**: Demolition 66.0 → 68.0 roto points, RGing Sluggers 45.0 → 44.0, Diamond Kings 37.0 → 36.0.
- **Internal:** MLB statsapi returns one split per team plus an aggregate row; the sync took `splits[0]`. It now selects the aggregate (`sport.id === 0`). The two tempting alternatives are both wrong and are pinned by tests — summing double-counts single-team players, and keying off a missing `team` field fails because the aggregate carries `team` when only one club is involved.
- **Known gap:** the period reconciler shares its fetch path with the syncer by design (ADR-014), so it reported "0 mismatches" while this was live — it was comparing the pipeline against itself. Giving it an independent source is filed as follow-up.
- **Internal:** Regenerated stale living docs (CI had been red on `refresh-docs` for ~10 days, blocking unrelated merges) and made the two DB integration suites run sequentially, fixing an intermittent foreign-key flake caused by `RESTART IDENTITY` colliding ids across concurrently-executing test files.

## v2.2.0 — 2026-07-06 — feature
### Email signup on the marketing site

- **Feature:** Visitors can subscribe for updates from the home page at thefantasticleagues.com — a verified **double opt-in** list (confirmation email required, one-click unsubscribe). Only the email address is stored; no names, no tracking scripts.
- **Internal:** New `Subscriber` table (Row-Level-Security-locked from the public/anon key — writes only via the server); public `/api/public/subscribe` endpoint with honeypot + per-IP rate limit + per-address cooldown; server-rendered confirm/unsubscribe pages; confirmation email via Resend. Also fixed a rotated/invalid Resend API key that had been silently breaking league-invite emails.

## v2.1.2 — 2026-06-29 — reliability
### Deploy monitoring + CI/test hardening (internal)

- **Reliability:** Automated deploy-failure alerting — `/api/health` now reports the deployed commit, and CI fails (notifying maintainers) if a push doesn't actually go live. Prevents a recurrence of a silent deploy freeze.
- **Internal:** Hardened the destructive-test database guard (fail-closed); draft integration tests now run in CI against an ephemeral Postgres; fixed an IPv6 rate-limiter boot warning. No user-facing behavior change.

## v2.1.1 — 2026-06-29 — fix
### Deploy pipeline restored; recent features now actually live

- **Fix:** Production deploys had been failing for 8 days (a failed Prisma migration blocked every Railway boot via P3009). Resolved the migration state and redeployed — the MLB snake draft, NFL/NBA dashboards, and Scoring Settings built over the prior week are now actually live in production.
- **Fix:** Server CI typecheck (red since the standings refactor) restored to green.
- **Verification:** OGBA standings audited against FanGraphs/OnRoto — all 8 teams reconcile exactly.
- **Internal:** Hardened a destructive test-database guard and added regression tests; no user-facing change.

## v2.1.0 — 2026-06-22 — improvement, feature
### In-season standings accuracy + AI refinements

- **Improvement:** Real-time stat sync now 99.2% accurate (up from 96%)
- **Improvement:** Daily stat line reconciliation for retroactive corrections
- **Feature:** Claude AI micro-adjustments for keeper-league scoring anomalies
- **Feature:** Injury reserve auto-flagging when player moves to IL/DTD

## v2.0.0 — 2026-05-01 — feature, breaking
### Live auction WebSockets + AI scoring overhaul

- **Feature:** Real-time live auction with bid concurrency handling
- **Feature:** Gemini + Claude AI hybrid scoring for league context
- **Feature:** League-specific stat weighting (per-league custom scoring rules)
- **Breaking:** Old single-league API endpoints consolidated to v2 namespace

## v1.5.0 — 2026-03-15 — feature, improvement
### Keeper league automation

- **Feature:** Multi-year keeper tracking and salary cap management
- **Feature:** Draft order randomization and tie-breaking rules
- **Improvement:** Auction timer presets for different league sizes
