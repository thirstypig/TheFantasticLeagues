---
id: DOC-003
title: "Feature intake rules"
description: "The gate a feature request must pass before it earns a PRD. Default answer is 'not yet'."
type: intake-rules
status: active
phase: null
owner: james
tags: [league-admin]
links: [DOC-002, DOC-005]
updated: 2026-07-23
---

# Feature intake rules

**A feature request is not a feature.** This is the gate it passes through first.

Nothing enters [launch-spec](launch-spec.md) without a PRD, and no PRD gets written until
the request answers all five questions below.

> ## The default answer is "not yet — log it in the roadmap."
>
> This is not obstruction. On a solo project with a live league and real money in play,
> the scarce resource is not ideas — it is **finished, verified work**. A "yes" here is
> a "no" to something already committed to. The gate makes that trade explicit instead of
> silent.

<!-- Prompt-to-self: if you find yourself arguing that a particular request "obviously"
     doesn't need the gate, that is precisely the request that needs it. The gate is
     cheapest to skip and most costly to have skipped. -->

---

## The five questions

A request must answer **all five**. An answer of "I don't know" is a legitimate answer —
it just means the request isn't ready, not that it's rejected.

### 1. What problem, for whom?

- Which specific person or role hits this? (An owner? The commissioner? A prospective user?)
- What do they do **today** instead? If the answer is "nothing, they live with it," say so.
- How often does it actually bite? A guess is fine — an unstated guess is not.

**Fails if:** the problem is stated as a missing feature ("we don't have X") rather than a
blocked user ("an owner can't do Y").

### 2. Which KPI does it move, and to what target?

- Name **one** primary metric.
- State a target number, and how you'd know if you hit it.
- **Is it instrumented today?** If not, that instrumentation is part of the cost — count it.

**Fails if:** the KPI is "engagement" or "it'd be nice." Also fails if the metric can't be
measured and nobody's willing to build the measurement.

> Reality check for this project: PostHog runs with `autocapture: false`. Route pageviews
> are captured automatically; **everything else requires an explicit `track()` call.**
> A feature whose success metric isn't a pageview is proposing instrumentation work too.

### 3. Does it strengthen the core value, or is it periphery?

The core value: *fantasy baseball for the dozen-owner, auction-draft, keeper-league crowd
that Yahoo and ESPN never really served.*

- **Core** — the thing those owners can't get elsewhere: auction/keeper mechanics,
  period-based roto scoring, commissioner tooling, real-money league administration.
- **Periphery** — genuinely useful, but a thing Yahoo already does adequately, or a thing
  an owner could get from Fangraphs in another tab.

Periphery isn't disqualifying. **Unacknowledged periphery is.** Say which it is.

**Fails if:** the answer is "core" without an argument for why a competitor's version
wouldn't serve the user just as well.

### 4. What does it cost — to build *and* to run?

- Build: rough size (hours / days), and which of the risky paths it touches — **roster,
  transactions, scoring, payouts** are the ones that can lose real money.
- Run: recurring cost. Any AI call, any new external service, any new cron job, any new
  table that needs backfilling or reconciling.
- Ongoing: **who maintains it when it breaks mid-season?** (Answer: you. Always you.)

**Fails if:** run-cost is unexamined, or if it touches a money path without saying so.

### 5. What are we deferring to fit it?

Name the specific thing that moves back. Not "we'll find time" — a named item from the
roadmap or the todo list.

**Fails if:** nothing is named. Capacity is fixed; a request that costs nothing to accept
is a request whose cost hasn't been found yet.

---

## The bar for bypassing the gate

Three cases skip it legitimately:

| Case | Why |
|---|---|
| **Bug fixes inside locked scope** | Fixing committed behaviour isn't new scope. The four open P1s (`todos/298`, `299`, `300`, `306`) need no gate. |
| **Live-season incidents** | A frozen deploy or broken scoring path gets fixed now and documented after. |
| **Docs, tests, refactors with no user-facing change** | No new surface area, no new maintenance promise. |

Everything else goes through the five questions.

---

## Outcomes

| Outcome | Meaning | Next step |
|---|---|---|
| **Cleared** | All five answered, trade-off accepted | Write the PRD → `status: draft` |
| **Not yet** | Real idea, wrong moment | Log in [roadmap](roadmap.md) with an id. This is the **default**. |
| **No** | Doesn't strengthen core value and cost isn't justified | Say so plainly, in writing, so it isn't re-raised in three months |

A "not yet" that's been logged three times without being picked up is data — either the
roadmap ranking is wrong, or the idea is actually a "no." Review those periodically.

---

## Worked example

**PRD-001 (`/compare`) did not clear this gate** — it was written before the gate existed.
Applying the questions retroactively:

| Q | Answer |
|---|---|
| 1. Problem | An owner comparing two players has no same-screen surface. Real. Frequency **unknown**. |
| 2. KPI | Proposed: repeat visits by ≥6 of 12 owners. Pageviews measurable today; players-per-comparison **is not instrumented**. |
| 3. Core or periphery | **Periphery, acknowledged.** Yahoo does this well; owners can use Fangraphs in another tab. |
| 4. Cost | Small–medium. **Read-only** — touches no money path. Zero run cost, no AI. |
| 5. Deferring what? | **Never answered.** It has not been ranked against the four open P1s. |

**Verdict: does not clear — question 5 is unanswered.** That is not an argument against
building it; it's an argument for answering question 5 first. This is exactly the kind of
thing the gate exists to surface, and it surfaced it on the very first PRD.
