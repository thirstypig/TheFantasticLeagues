# TFL Rules Audit

Owner: engineering + commissioner visibility
Last updated: 2026-04-19 (Session 69)

## TL;DR

TFL has **two independent configuration systems** that both behave like "league rules," and they overlap in places. The result: a commissioner can change the same-feeling setting in two different UIs and see two different numbers stick. This document catalogs both, flags overlaps and gaps, and proposes a unification path.

## The two systems

### System A — `League.*` direct Prisma fields
Stored directly as columns on the `League` model. Edited via the Commissioner page's "League", "Waivers", and "Trades" tabs (each rendered by `SettingsSection`).

| Field | Default | Edited in | Notes |
|---|---|---|---|
| `name`, `season`, `sport` | — | League tab | Identity — almost never changes mid-season. |
| `scoringFormat` | `ROTO` | League tab | ROTO / H2H_CATEGORIES / H2H_POINTS |
| `pointsConfig` | `null` | League tab | JSON weights, only used when scoringFormat = H2H_POINTS |
| `playoffWeeks` | `3` | League tab | |
| `playoffTeams` | `4` | League tab | |
| `regularSeasonWeeks` | `20` | League tab | |
| `maxTeams` | `12` | League tab | **Overlaps with `overview.team_count` in System B.** |
| `visibility` | `PRIVATE` | League tab | PRIVATE / PUBLIC / OPEN |
| `description` | `null` | League tab | Free text |
| `entryFee` | `null` | League tab | **Overlaps with `payouts.entry_fee` in System B.** |
| `entryFeeNote` | `null` | League tab | |
| `waiverType` | `FAAB` | Waivers tab | FAAB / ROLLING_PRIORITY / REVERSE_STANDINGS / FREE_AGENT |
| `faabBudget` | `200` | Waivers tab | |
| `faabMinBid` | `0` | Waivers tab | |
| `waiverPeriodDays` | `2` | Waivers tab | |
| `processingFreq` | `DAILY` | Waivers tab | DAILY / WEEKLY_MON/WED/FRI/SUN |
| `faabTiebreaker` | `ROLLING_PRIORITY` | Waivers tab | |
| `acquisitionLimit` | `null` | Waivers tab | null = unlimited |
| `conditionalClaims` | `true` | Waivers tab | |
| `tradeReviewPolicy` | `COMMISSIONER` | Trades tab | COMMISSIONER / LEAGUE_VOTE |
| `vetoThreshold` | `4` | Trades tab | |
| `tradeDeadline` | `null` | Trades tab | Date |
| `rosterLockTime` | `null` | Trades tab | GAME_TIME / DAILY_LOCK / null |
| `draftMode` | (enum) | Not user-editable | Admin/setup only |
| `isPublic`, `publicSlug`, `inviteCode` | — | Settings / invite flow | |

### System B — `LeagueRule` rows via `DEFAULT_RULES`
Stored as per-league rows in the `LeagueRule` table (category + key + value). Edited via the `RulesEditor` component mounted under Commissioner → Rules.

Grouped by category as they appear in the editor:

| Category | Key | Default | Config type | Notes |
|---|---|---|---|---|
| overview | team_count | 8 | slider 4–16 | **Overlaps with `League.maxTeams` (12).** |
| overview | stats_source | NL | select | NL / AL / MLB / Other |
| roster | pitcher_count | 9 | slider 1–20 | |
| roster | batter_count | 14 | slider 1–25 | |
| roster | roster_positions | JSON `{C:2, 1B:1, …}` | object counts | |
| roster | outfield_mode | OF | select | OF / LF/CF/RF |
| roster | dh_games_threshold | 20 | slider 1–50 | |
| roster | position_eligibility_gp | **3** (Session 69) | slider 1–50 | Global today; per-league in future. |
| roster | pitcher_split | P_ONLY | select | P_ONLY / SP_RP (Session 69) |
| scoring | hitting_stats | `[R,HR,RBI,SB,AVG,OPS,H,2B,3B,BB]` | checkbox_list | |
| scoring | pitching_stats | `[W,SV,K,ERA,WHIP,QS,HLD,IP,CG,SHO]` | checkbox_list | |
| scoring | min_innings | 50 | select | |
| draft | draft_mode | AUCTION | select | AUCTION / DRAFT |
| draft | draft_type | SNAKE | select | SNAKE / LINEAR |
| draft | auction_budget | 400 | number | |
| draft | min_bid | 1 | select | 1–5 |
| draft | bid_timer | 15s | select | |
| draft | nomination_timer | 30s | select | |
| draft | keeper_count | 4 | slider 0–10 | |
| il | il_slot_1_cost | $10 | number | |
| il | il_slot_2_cost | $15 | number | |
| bonuses | grand_slam | $5 | number | |
| bonuses | shutout | $5 | number | |
| bonuses | cycle | $10 | number | |
| bonuses | no_hitter | $15 | number | |
| bonuses | perfect_game | $25 | number | |
| bonuses | mvp | $25 | number | |
| bonuses | cy_young | $25 | number | |
| bonuses | roy | $10 | number | |
| payouts | entry_fee | $300 | number | **Overlaps with `League.entryFee`.** |
| payouts | payout_1st..8th | 40,25,15,10,5,3,2,0 (%) | number 0–100 | |

## Overlaps (same meaning, two storage locations)

These are the biggest bug-producers. Commissioners edit one and expect the other to reflect.

1. **Entry fee** — `League.entryFee` (Float) ⇄ `LeagueRule(payouts.entry_fee)` (String).
2. **Team count** — `League.maxTeams` (Int, default 12) ⇄ `LeagueRule(overview.team_count)` (String, default 8).

**Recommendation:** remove from `DEFAULT_RULES` and read exclusively from `League.*`. The Prisma columns are better typed, more queryable, and already wired to the Commissioner tabs. The audit closes both this session.

## Gaps — viewable but not editable anywhere in a rules-style UI

None found in this pass. Every League.* field has an editor in the Commissioner page; every LeagueRule key has a RULE_CONFIG entry in RulesEditor. **But:** they live in different tabs and use different UIs, which is the root of the user's "I had a bunch of tweaks here and there" frustration.

## Hardcoded magic numbers that *should* be rules

Flagged by grep, not yet lifted into rules:

| Value | Where | Should be |
|---|---|---|
| `3` (position eligibility) | server/src/index.ts daily cron | Per-league `position_eligibility_gp` — partial fix in Session 69, still global in cron. |
| `100` (max transactions page size) | transactions routes | `max_transactions_page_size`? Low-priority. |
| Ohtani MLB ID `660271` | sportConfig special-case | Not a rule — hardcoded is correct here. |
| `20` games for DH qualification | passed but unused | `dh_games_threshold` rule exists; no consumer reads it. Either wire or delete. |

## Recommendations (priority-ordered)

### P1 — resolve the overlaps this session
- **Remove `overview.team_count` and `payouts.entry_fee` from `DEFAULT_RULES`.** Read from `League.maxTeams` / `League.entryFee` instead.
- Flag in Commissioner → Rules header: "Waiver, trade, playoff, and discovery settings live in the other Commissioner tabs."

### P2 — unify the UIs (follow-up session)
Either:
- Render `League.*` direct fields as additional categories inside `RulesEditor` ("league", "waivers", "trades"); keep the dedicated tabs for discoverability but have them point at the same endpoint.
- Or the opposite: migrate every `DEFAULT_RULES` key into `League.*` columns and retire the `LeagueRule` table.

The first is cheaper and preserves the per-league override model; the second is cleaner long-term but requires a schema migration.

### P3 — delete or wire `dh_games_threshold`
No consumer reads it. Either surface it in the DH eligibility logic or remove from DEFAULT_RULES.

### P4 — make the cron multi-league aware
`syncPositionEligibility(season, 3)` today runs once globally. When the second league joins with a different threshold, iterate per-league and read `position_eligibility_gp` from `LeagueRule`.

## Changes landing with this audit (Session 69)

- Removed `overview.team_count` from DEFAULT_RULES (superseded by `League.maxTeams`).
- Removed `payouts.entry_fee` from DEFAULT_RULES (superseded by `League.entryFee`).
- Added header note to `RulesEditor` pointing to the other Commissioner tabs for waiver/trade/playoff settings.

---
*Next: /admin/rules-audit page rendering this doc live + a "duplicate detector" that flags divergent values — tracked as follow-up.*
