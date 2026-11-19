---
id: DOC-004
title: "Glossary"
description: "Every project-specific term, acronym, and persona. If a term needs explaining twice, it belongs here."
type: glossary
status: draft
phase: null
owner: james
tags: [scoring, league-admin]
links: [DOC-001]
updated: 2026-07-23
---

# Glossary

**Define every project-specific term, acronym, and persona here.**

Rule of thumb: if you've had to explain a term twice — to a new owner, to a contractor, or
to yourself six months later — it belongs in this file. Fantasy baseball vocabulary and
roto scoring vocabulary overlap confusingly, and this project has several terms that mean
something *different* here than they do on Yahoo.

<!-- Prompt-to-self: the highest-value entries are the ones where OUR meaning differs from
     the industry-standard meaning. Those are the ones that cause real bugs and real
     arguments. Mark them clearly. -->

---

## Terms

| Term | Definition | Notes |
|---|---|---|
| **OGBA** | The live league this app was built for. A dozen owners, auction draft, keeper rules, real entry fees and payouts. | The single production tenant today. <!-- TODO(james): what does OGBA stand for? --> |
| **Period** | A scoring window. OGBA scores **each period as a standalone roto contest** (10 categories × 8 teams, 1–8 points per category), and period points accumulate across the season. | ⚠️ **Differs from industry norm.** This is NOT year-to-date roto. OnRoto's season points are on a different scale and will not match ours. See ADR-013. |
| **Ownership-window attribution** | Stats count only for the days a player was actually on your roster. Pre-acquisition stats don't count for the acquirer; post-drop stats don't count for the dropper. | ⚠️ **Differs from OnRoto**, which displays current-roster full-season YTD. Ours is the scoring authority; theirs is a display convenience. See ADR-013. |
| | | |
| **Wire list** (UI: "List") | Each owner's two independent ranked lists for a waiver period: an **Add list** (players to claim, in priority order) and a **Drop list** (players to release or IL-stash, top = drop first). When the period runs, each successful add consumes the next pending drop. Tables `WaiverPeriod`, `WaiverAddEntry`, `WaiverDropEntry`. | **Not "waivers".** The older auto-claim system (`WaiverClaim`, `/api/waivers`) was retired on 2026-10-19 (#466) after it had zero prod rows ever. Only the wire list is live; the `WaiverClaim` table remains in the schema. Renamed "List" in the UI (#498). |
| **Franchise** vs **team** | A **franchise** is the league organization that persists across seasons: its name, invite code, public slug, trade-review policy and commissioner memberships (`Franchise`, `FranchiseMembership`). Each season's `League` row points at its franchise. A **team** is one owner's entry inside one season's league (`Team.leagueId`): its roster, budget and code. | Owners and commissioners belong to the franchise; rosters and points belong to the team. A new season means a new `League` and new `Team` rows under the same franchise. |

**Candidates that should be defined here** — I know these terms appear throughout the
codebase and docs, but defining them from code alone risks getting the *intent* wrong:

`keeper` · `FAAB` · `IL stash` · `two-way player` · `slot` (vs. `position`) · `snapshot` ·
`period rollover` · `contested IL fee`

(Wire list vs. waivers and franchise vs. team are now defined in the table above.)

---

## Personas

| Persona | Who they are | What they need |
|---|---|---|
| **Owner** | One of the ~12 league members. Manages a roster, makes add/drops, trades, sets lineups. | Speed and clarity on roster decisions. Yahoo is their reference for how things should feel. |
| **Commissioner** | Runs the league. Closes periods, processes the wire list, handles fees and payouts, resolves disputes. | Correctness and an audit trail. Their trust in the numbers is the product. |
| <!-- TODO(james) --> | | |

**Not yet a persona:** the *prospective public user*. The app has one tenant and the
current phase is hardening, not acquisition. Add this persona when that changes.

---

## Deliberately ambiguous terms — resolve these

Terms currently used in more than one sense in the codebase or docs. Each is a live source
of confusion:

| Term | Sense A | Sense B |
|---|---|---|
| **`SlotCode`** | The full set including `SP`/`RP`/`BN`/`IL` (shared type) | The eligibility subset only (local type in `positionEligibility`) |
| **Waivers** | The legacy paired-row auto-engine, still running | Colloquially, the newer Wire List — a different system |
| **Roster** | Current-state roster (who's on the team now) | Period-scoped roster (who was on it during a window) — the same table answers both by filter |

<!-- TODO(james): these three have each caused a real bug. Worth writing a sentence on the
     resolution rule for each, not just documenting the ambiguity. -->
