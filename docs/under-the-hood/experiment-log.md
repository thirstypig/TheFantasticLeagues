---
id: DOC-017
title: "Experiment log"
description: "Closes the loop on PRD hypotheses. Each entry names the bet, then records what actually happened."
type: experiment
status: active
phase: null
owner: james
tags: [players, docs-system]
links: [PRD-001, DOC-003]
updated: 2026-07-23
---

# Experiment log

## What this is, in plain English

Every PRD makes a **bet** — "we believe X will cause Y." This file is where that bet gets
**settled**. Without it, PRDs are a record of what you hoped, and nothing ever comes back
to tell you whether you were right.

The entry is written **before** the result is known. That's the whole point: a hypothesis
recorded after the fact is just a description.

<!-- Prompt-to-self: the failure mode here is quietly abandoning experiments whose results
     were disappointing. A `result: inconclusive` honestly recorded is worth more than a
     silent deletion — and "we never measured it" is itself a finding worth writing down. -->

---

## `EXP-001` — Does side-by-side comparison become a habit?

| | |
|---|---|
| **Links** | [PRD-001](../product/prds/PRD-001-player-comparison.md) |
| **Status** | `pending` — the feature is unbuilt and unapproved |
| **Owner** | james |
| **Opened** | 2026-07-23 |

**Hypothesis (from PRD-001 §4).** Giving owners a same-screen stat comparison will make
`/compare` a recurring part of the weekly add/drop routine — measured as **repeat visits per
owner per week**, not one-time curiosity visits.

**Primary metric.** Owners visiting `/compare` in ≥2 distinct weeks. **Target: ≥6 of 12.**

**Secondary.** Median players per comparison (target ≥3 — if it's ~2, a simpler two-up view
would have sufficed). Deep-links opened from a shared `?players=` URL.

**We're wrong if.** A first-week traffic burst followed by near-zero repeat use. That would
mean the comparison job was already being done adequately in another browser tab, and we
built a worse copy of Fangraphs.

**Can we actually measure this?**

| Metric | Instrumented |
|---|---|
| `/compare` pageviews, attributed to an owner | **Yes** — `PostHogTracker` fires on route change, `identifyUser()` on login |
| Players per comparison | **No** — needs an explicit `track()` call |
| Deep-link vs. in-app-search hydration | **No** — needs an explicit `track()` call |

> ⚠️ **Blocking caveat.** PostHog init is gated on `VITE_POSTHOG_KEY` and its status in
> Railway production is **unverified** (`RISK-011`, inbox `C-004`). If it's unset, this
> experiment cannot run at all — and that must be resolved *before* the feature ships, not
> discovered afterwards.

**Result.** `pending`

**What we learned.** <!-- fill in when the result lands, including "we never measured it" -->

---

## Template

```markdown
## `EXP-###` — <the question in one line>

| | |
|---|---|
| **Links** | PRD-### |
| **Status** | pending / running / concluded / abandoned |
| **Owner** | |
| **Opened** | YYYY-MM-DD |

**Hypothesis.** We believe X will cause Y.
**Primary metric.** One metric, one target number.
**We're wrong if.** The specific observation that would falsify it.
**Can we actually measure this?** Instrumented today — yes/no, per metric.
**Result.** pending
**What we learned.** <!-- including "we never measured it" -->
```

---

## Experiments we should have run but didn't

*Honest accounting. Every shipped feature made an implicit bet; almost none were recorded,
so almost none can be settled.*

| Feature | The implicit bet | Can we settle it now? |
|---|---|---|
| AI features (8 of them) | Owners want generated analysis enough to justify per-call cost | **No.** No usage instrumentation, and per-call cost is unknown — see [costs](costs.md). |
| NBA / NFL dashboards | Multi-sport broadens appeal beyond baseball | **No.** Both ship hardcoded mock data; there is nothing to measure. |
| Wire List (replacing legacy waivers) | The two-list model beats the legacy paired-row engine for owners | **Partially.** Adoption is observable, but no before/after was captured, and the legacy system still runs alongside it. |

<!-- TODO(james): the pattern is consistent — features shipped, bets unstated, results
     unmeasurable. That's normal for a solo project moving fast, and it's fixable going
     forward at the cost of one EXP entry per PRD. It is NOT worth retrofitting
     experiments onto shipped work; the data doesn't exist. -->
