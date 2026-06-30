# Changelog

All notable changes to The Fantastic Leagues will be documented in this file.

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
