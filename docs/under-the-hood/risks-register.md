---
id: DOC-016
title: "Risks register"
description: "Running list of live risks and open questions, each with an id, status, and owner."
type: risk
status: active
phase: null
owner: james
tags: [league-admin, deploy, scoring]
links: [ADR-015, DOC-007, DOC-002]
updated: 2026-07-23
---

# Risks register

A running list of things that could go wrong, and open questions that could change a
decision. Each has a stable `RISK-###`, a status, and an owner.

**Status:** `open` · `mitigated` (reduced, not gone) · `accepted` (known, deliberately
living with it) · `closed` (genuinely gone).

> **A risk is not a bug.** A bug is broken now; a risk is what breaks later, or what breaks
> if an assumption turns out wrong. Bugs go in `todos/`. Several rows below **point at**
> a bug because the bug is the evidence the risk is real.

<!-- Prompt-to-self: `accepted` is a real answer and often the right one on a solo project.
     What's not acceptable is `open` forever with no owner and no re-review date. -->

---

## Live risks

| ID | Risk | Impact | Status | Owner | Notes |
|---|---|---|---|---|---|
| `RISK-001` | **4 circular feature dependencies** — `teams ↔ transactions` (server + client), `auction ↔ teams`, `commissioner ↔ roster` | A cycle means the module boundary isn't real. Changes ripple unpredictably across the roster and transaction paths — the highest-consequence code in the repo. | `accepted` | james | Grandfathered by [ADR-015](../engineering/adrs/ADR-015-feature-module-boundaries.md). Fix opportunistically when already in those files; **never** as a big-bang refactor mid-season. |
| `RISK-002` | **The isolation ratchet is not wired to CI** | Without a gate the check is voluntary. Voluntary conventions are exactly what took this from 6 documented exceptions to 85 actual. | `open` | james | One edit to `.github/workflows/ci.yml`. Highest-leverage open item from this session. Inbox `C-002`. |
| `RISK-003` | **A migration can freeze production, and a 200 health check cannot detect it** | Prod serves a stale image while `main` looks healthy. **Has happened twice** — 21 h (2026-05-05, `CREATE INDEX CONCURRENTLY`), **8 days** (2026-06-29, `P3009` on a bare `CREATE TYPE`). | `mitigated` | james | `verify-deploy.yml` compares `/api/health` version to the merged SHA and emails on mismatch (PR #405). Mitigated, not closed — it detects, it doesn't prevent. |
| `RISK-004` | **Ingestion jobs can fail silently** | Stats sync runs on cron 4×/day with no run tracking and no alerting. A silent failure means standings are wrong and nobody knows until an owner complains. Money-adjacent — OGBA has payouts. | `open` | james | Open P1 `todo 299`. Compounded by `todo 300` (no `syncedAt` on scoring tables), so you can't distinguish stale from fresh. |
| `RISK-005` | **IL-fee reconciliation has never run for two closed periods** | Real money. Two `OutboxEvent` rows exhausted their retries on a Postgres advisory-lock type error (`42883`) and have been stuck since June 2026. | `open` | james | Open P1 `todo 298`. Found by a staleness audit — **no stat audit could have caught it**, which is itself the lesson. |
| `RISK-006` | **Period rollover is manual** | A late rollover misdates owners' moves and requires backdating. Closing a period also auto-bills contested IL fees, so late close has financial consequences. | `accepted` | james | No cron by choice. Accepted while there's one league and one commissioner; does not survive a second league. |
| `RISK-007` | **Three databases, easy to confuse** | `server/.env` → local, `server/.env.local` → a separate cloud project, prod → Railway only. A mutation you believe is local may hit cloud, or vice versa. | `mitigated` | james | Documented in `CLAUDE.md` and [tech-spec](../engineering/tech-spec.md). Mitigation is documentation only — there is no mechanical guard. |
| `RISK-008` | **The canonical roadmap is 65 days stale** | `planning.json` was declared canonical on 2026-07-11 but last updated 2026-05-19. The in-app `/roadmap` shows an old picture with full confidence — worse than showing nothing. | `open` | james | Inbox `C-001`. `docs:refresh` now prints a staleness warning in [stats](stats.md), so it can't hide again. |
| `RISK-009` | **62 board-scope docs have no frontmatter** | They cannot be indexed, filtered, or cross-linked. The board silently under-reports what exists — a knowledge base you can't search is a folder. | `open` | james | Plus 35 off-vocabulary `type` values and 12 off-vocabulary `status` values. Counts regenerate in [stats](stats.md). |
| `RISK-010` | **No server-side linting at all** | The client has ESLint with no import rules; the server has no ESLint config. Whole classes of error have no automated catch. | `accepted` | james | Considered and rejected as the isolation mechanism in ADR-015 — standing up server linting is its own project. Worth revisiting. |
| `RISK-011` | **Product analytics may be capturing nothing in production** | PostHog init is gated on `VITE_POSTHOG_KEY`, and `autocapture: false` means there is no ambient safety net. If the key is unset in Railway, every "we can measure this" claim is false. | `open` | james | Configured locally; **prod unverified**. Inbox `C-004`. One-minute check. |

---

## Open questions

Not risks — decisions that haven't been made, where the absence of a decision is itself
the cost.

| ID | Question | Why it matters | Owner |
|---|---|---|---|
| `RISK-012` | Should `/compare` be built before the four open P1s? | PRD-001 fails intake question 5 — it has never been ranked against `todos/298, 299, 300, 306`, two of which are money-adjacent. | james |
| `RISK-013` | Is the commented-out chat REST router dead code or a deliberate WebSocket-only choice? | It sits commented in `index.ts` while chat runs live. If dead, delete it; if deliberate, log it. Ambiguous code invites someone to "fix" it. | james |
| `RISK-014` | For todos, does the filename or the frontmatter own `status`? | Two sources of truth that nothing reconciles. Has already required cleanup sweeps. | james |
| `RISK-015` | Is the launch spec an in-season freeze, or the next launch? | The two readings produce materially different IN/OUT lists. | james |

---

## Add your own

*The list above is what the **code and docs** could reveal in one session. It is missing
everything only you know — league politics, commissioner dependencies, what you're
personally worried about at 2am.*

| ID | Risk | Impact | Status | Owner | Notes |
|---|---|---|---|---|---|
| `RISK-016` | <!-- TODO(james) --> | | `open` | james | |
| `RISK-017` | <!-- TODO(james) --> | | `open` | james | |

<!-- TODO(james): specific gaps I could not assess from the repo —
     (a) what happens to the league if you are unavailable for two weeks mid-season?
     (b) is there a database backup/restore procedure that has actually been TESTED?
         Supabase free tier's backup guarantees are worth confirming, not assuming.
     (c) key-person risk on the commissioner role itself.
     None of these are visible in code. All three are plausibly bigger than anything above. -->
