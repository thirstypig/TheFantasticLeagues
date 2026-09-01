# Changelog

All notable changes to The Fantastic Leagues will be documented in this file.

## v2.4.0 — 2026-08-31 — feature
### Commissioner balances, and the last of the IL-fee correctness work

- **Feature — Commissioner → Finances → Balances shows real numbers.** The tab read *"coming soon"*; it now lists every team's net ledger balance, including teams with no charges at $0. Ledger and Payouts remain stubs and now say so accurately instead of hiding behind a shared placeholder.
- **Money — a bug that would have under-billed the next IL stash.** The 3-way move (add + stash to IL + drop, all in one transaction) recorded the stash in the activity log but not in the log fees are billed from, so that stint would never have been charged. Nothing was mis-billed because nobody had used that path yet; the fix closes it before anyone does.
- **Fix — the IL drift alarm stopped crying wolf.** It flagged one player forever: a drop taken while on IL closes the stint, but the two logs name that event differently (`DROP` vs `IL_RELEASE`). A permanent false alarm on a money check is how the next real one gets ignored. Prod drift is now zero.
- **Verified, not assumed — nothing is owed.** A new read-only preview re-ran the fee reconcile across all six closed periods: **0 charges to add, 0 to void, $0 net**. The IL log repair from the previous session had already been applied in full; the ledger matches it.

- **Internal:** the standings audit no longer disagrees with production about who counts as a pitcher, and no longer credits a mid-period-traded player's full line to *both* teams. Both were instrument bugs — production always scored correctly. Verified against prod: the first moved zero numbers across 6 periods × 8 teams, and the second moves none on closed periods (the affected trade sits in the still-open Period 7, which is where it will matter).
- **Internal:** todo status lived in two places that disagreed on 87 of 308 files. Deleted the second source rather than syncing it; a test now fails if it grows back.
- **Internal:** a CI check failed on the clock rather than on staleness — the generated docs block embeds a UTC date, so a branch refreshed before UTC midnight and tested after failed with the *same error text* as a genuine staleness failure. Written up at `docs/solutions/test-failures/generated-doc-date-stamp-fails-ci-across-utc-midnight.md`.

## v2.3.0 — 2026-08-31 — fix
### IL fees are now billed, and two traded hitters came off the bench

- **Fix — traded players landed on the bench.** A commissioner-executed trade wrote the receiving roster row with no lineup slot. The app falls back to the player's primary position, but `"LF"` and `"RF"` are positions, not slot codes, so the client showed them as `BN`. Pitchers looked fine (`"P"` *is* a slot), which is why it read as intermittent. Teoscar Hernández and Dylan Crews were affected and have been restored to `OF`. Both trade paths now share one rule, so they cannot drift apart again.
- **Fix — commissioner "assign player to team" had the same defect** and would have benched every hitter assigned that way.
- **Money — IL fees are billed for the first time.** They had never been assessed: a Postgres type mismatch killed the reconcile in April, and the two queued jobs exhausted their retries before the July fix landed, with no way to reset them. Periods 2–6 are now settled at **$200** across seven teams. Four teams' balances went **down** — Dodger Dawgs and Demolition −$20 each, Diamond Kings and Skunk Dogs −$10 — and The Show's went up $35. Every correction is an auditable void plus reversal; nothing was edited in place.
- **Rules — a stint that ends on a period's first day no longer owes that period.** Backdated IL activations are stamped at 00:00 on a period's first day, and the old "any overlap bills the period" rule charged a full fee for **zero days** of occupancy. Commissioner decision; worth $120 across the league.
- **Fix — two players stashed in the same transaction were both charged the $15 second-slot rate.** Simultaneous stashes now correctly take one $10 slot and one $15 slot. Los Doyers were refunded $5.
- **Internal:** four billing defects were only reachable by actually writing — a repricing reported success while writing nothing, three times, because reversal rows are indistinguishable from charges in the query, the unique index, and the return value. Written up at `docs/solutions/logic-errors/repricing-reports-success-and-writes-nothing.md`.
- **Internal:** new safety nets — a nightly audit of every closed period against MLB, an hourly dead-man's switch for ingestion jobs, an alarm for outbox events that have exhausted their retries, and a drift check between the two IL logs that found 9 discrepancies on its first run.

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
