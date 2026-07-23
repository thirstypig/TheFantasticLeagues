---
id: DOC-002
title: "Launch spec — what's locked"
description: "The frozen scope boundary. Changing it requires the feature-intake process."
type: launch-spec
status: locked
phase: null
owner: james
tags: [league-admin]
links: [DOC-003, PRD-001]
updated: 2026-07-23
---

# Launch spec — what's locked

> ## Locked
>
> **Changes to the IN-scope list below require the feature-intake process** — see
> [feature-intake-rules](feature-intake-rules.md) (DOC-003). Nothing enters this list
> without a PRD that clears the gate. The default answer to a new mid-cycle feature is
> **"not yet — log it in the roadmap."**

<!-- Prompt-to-self: this document's job is to be BORING and to say NO. Its value is
     entirely in being hard to change. If it starts accumulating "and also…" bullets
     mid-cycle, the gate isn't working. -->

---

## Which launch is this?

This project is **past its original launch**. The app is live for OGBA — the auction has
wrapped and the 2026 season is in flight, with real entry fees and payouts riding on it.

So this is **not** a pre-launch scope document. It is a **stability boundary for the
in-season period**: what the live league depends on, and therefore what must not be
casually changed while the season runs.

<!-- TODO(james): confirm this framing. The alternative reading is that this doc should
     describe the *next* launch (public / multi-league availability) rather than the
     current in-season freeze. Those imply very different IN/OUT lists. I've written the
     in-season-freeze version because that's what the repo state supports today. -->

---

## IN scope — locked for the 2026 in-season period

*Fill these in. I've seeded only what the repo can actually prove is live; confirm or
strike each one.*

**Confirmed live** (from `CLAUDE.md` and merged PR history):

- [ ] Auction draft — complete for 2026; results frozen via the auction-day snapshot
- [ ] Roster management — v3 hub at `/teams/:code`, roster moves, IL stash / activate
- [ ] Wire List — two-list waiver model (ranked Add + ranked Drop), commissioner-driven
- [ ] Standings & scoring — period-by-period roto, accumulated (ADR-013)
- [ ] Period close / rollover — commissioner-driven, currently **manual** (no cron)
- [ ] Trades, trading block, watchlist, league board, chat
- [ ] AI features — draft report, draft report card, weekly digest, bid advice
- [ ] Auth — Supabase, Google / Yahoo OAuth + email/password
- [ ] Notifications — web-push

**Add anything I've missed or mis-stated:**

- [ ] <!-- TODO(james) -->
- [ ] <!-- TODO(james) -->

---

## OUT of scope — not this cycle

*The point of this list is that these are **decided**, not forgotten. Something on this
list does not get re-litigated mid-season; it gets logged in the roadmap.*

**Seeded from evidence in the repo — confirm or strike:**

- [ ] **New user signups / public availability** — current phase is explicitly code-quality
      hardening, not user acquisition
- [ ] **Player comparison (`/compare`)** — spec'd and reviewed, unbuilt, awaiting sign-off (PRD-001)
- [ ] **NBA / NFL beyond dashboard stubs** — those pages ship with hardcoded mock data
- [ ] **Automated period rollover** — deliberately manual today
- [ ] **Two-way (Ohtani) merged display** — affects zero players currently
- [ ] **Payments / billing** — no payment integration exists in this repo at all

**Add anything else you're deliberately saying no to:**

- [ ] <!-- TODO(james) -->
- [ ] <!-- TODO(james) -->

---

## Known open defects inside the locked scope

Being locked does not mean being correct. Four **P1** issues sit inside in-scope,
live-season surfaces and are tracked in `todos/`:

| Todo | Area | Summary |
|---|---|---|
| `298` | league-admin | IL-fee reconciliation has **never run** for two closed periods — Postgres advisory-lock type error. Money-adjacent. |
| `299` | data-sync | No ingestion-job run tracking or alerting |
| `300` | data-sync | No `syncedAt` timestamp on scoring tables |
| `306` | scoring | A position player's mop-up pitching is counted in team ERA/WHIP; OnRoto excludes it |

These are **bugs inside locked scope**, not new features. They do not require the intake
gate — fixing them is maintenance of what has already been committed to.

---

## Changing this document

1. Write a PRD that clears [DOC-003](feature-intake-rules.md).
2. Get that PRD to `status: active`.
3. *Then* amend the IN-scope list here and bump `updated`.

Editing this list without steps 1–2 is the exact failure mode this document exists to
prevent.
