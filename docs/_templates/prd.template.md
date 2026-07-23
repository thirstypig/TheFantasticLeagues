---
id: PRD-###
title: ""
description: ""
type: prd
status: draft
feature_status: planned
phase: null
owner: james
tags: []
links: []
updated: YYYY-MM-DD
---

# <Feature name>

<!-- Before writing this, the request must clear docs/product/feature-intake-rules.md.
     For a RETROACTIVE PRD (reconstructing a shipped feature), tag every claim
     [intended] / [inferred] / [unknown] and swap §4 and §9 for the hindsight variants
     noted below. A doc full of [unknown] is a success. -->

## 1. Problem statement

<!-- What's broken, for whom. Who specifically hits this, what they do today instead,
     and how often it actually bites. If frequency is a guess, say it's a guess. -->

## 2. Strategic rationale

<!-- Why now, why worth it. Tie to core value. If this is periphery, say so — unacknowledged
     periphery is the problem, not periphery. Record the honest origin, including "we picked
     this because the planned thing turned out to be done." -->

## 3. User story

> As a **<role>**, I want <capability>, so that <outcome>.

## 4. Hypothesis

<!-- We believe X will cause Y. We're wrong if <the specific falsifying observation>.
     RETROACTIVE VARIANT — "Assumptions": what had to be true for this to be worth
     building, including bets the build made implicitly but never stated. -->

## 5. Impact & KPIs

### (a) What the metric *should* be — the bet

<!-- One primary metric, a target number, and how you'd measure it. Write this BEFORE
     launch so it can be judged honestly afterward. -->

### (b) What we can measure **today**

<!-- Instrumented or not, per metric — state it plainly. PostHog runs with
     autocapture: false, so route pageviews are free and EVERYTHING else needs an explicit
     track() call. If it isn't instrumented, that instrumentation is part of the cost.
     Never invent numbers. "Not instrumented" is a complete answer. -->

## 6. Technical notes

<!-- How it is (or will be) built. New modules start with zero cross-feature imports
     (ADR-015). -->

## 7. AI implementation notes

<!-- Model, prompt strategy, estimated cost per call. If no AI is involved, write
     "None — this feature uses no AI" so a reader can tell that apart from an unfilled
     section. -->

## 8. Testing plan

<!-- What tests exist vs. what should. Browser verification is MANDATORY on UI changes,
     and a feature with two code paths needs both driven — verifying one is partial. -->

## 9. Deferred / future enhancements

<!-- Explicitly out of scope, with the reason for each.
     RETROACTIVE VARIANT — "What we'd do differently": what the code reveals you got wrong,
     over-built, or under-built. Be candid; this is where the exercise pays off. -->

## 10. Open questions

<!-- Anything blocking sign-off. Name the person who owns each answer. -->
