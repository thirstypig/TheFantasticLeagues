---
id: ADR-015
title: "ADR-015: Feature module boundaries are enforced by a ratchet, not a refactor"
description: "Feature modules must not import each other. Existing violations are grandfathered; new ones fail CI."
type: adr
status: active
phase: null
owner: james
tags: [testing, design-system, database]
links: [DOC-007, DOC-009, DOC-016]
updated: 2026-07-23
---

# ADR-015: Feature module boundaries are enforced by a ratchet, not a refactor

> **What an ADR is for.** Big, costly-to-reverse decisions — architecture, data model,
> a dependency you'd have to live with for years. Small calls ("renamed this helper,"
> "switched to `date-fns`") go in [decision-log](../decision-log.md) (DOC-009) as a
> one-liner. If reversing it would take a week, it's an ADR.

**Date:** 2026-07-23 · **Status:** accepted

---

## Context

The codebase is organised into **63 domain feature modules** — 34 on the server, 29 on
the client — each meant to own its own routes, services, pages, components, and API client.
The pattern is documented in `docs/guides/feature-modules.md`.

The pattern is real and half-honoured. A full scan of every import across all 63 modules
on 2026-07-23 found:

| Measure | Value |
|---|---|
| Modules with **zero** outbound cross-feature imports | **34 of 63** (20/34 server, 14/29 client) |
| Production cross-feature imports | **85** (36 server, 49 client) |
| Same, in test files | 12 |
| **Circular** feature dependencies | **4** |
| Exceptions documented in `feature-modules.md` | **6** |
| Automated enforcement | **none** |

The four cycles:

- `server: teams ↔ transactions`
- `client: teams ↔ transactions`
- `client: auction ↔ teams`
- `client: commissioner ↔ roster`

### The real diagnosis

These are not 85 arbitrary rule-breaks. Five modules have quietly become **shared
infrastructure without ever being promoted to a shared location**:

| Module | Inbound imports | What it actually is now |
|---|---|---|
| `transactions` | 12 client, 7 server | de-facto shared |
| `standings` | 8 server | de-facto shared |
| `teams` | 8 client | de-facto shared |
| `players` | 5 server | de-facto shared |
| `commissioner` | 5 server | de-facto shared |

The codebase already knows the correct fix and has applied it before: `StatsTables` was
**promoted out of** `standings` into `client/src/components/shared/`, and both `standings`
and `leagues` had their pages removed once they became API-only. The pattern is
established — it just hasn't been applied to the other five.

### Why the drift happened

Nobody defected. The convention doc lists 6 sanctioned exceptions; reality is 85. The doc
simply stopped being updated, **because nothing forced it to be.** A convention with no
automated check decays monotonically — every individual exception is locally reasonable,
and the aggregate is never visible to anyone.

---

## Decision

**1. Feature modules must not import from other feature modules.**
Code needed by two or more features gets **promoted** to a shared location:

| Shared location | For |
|---|---|
| `client/src/components/shared/` | Cross-feature React components |
| `client/src/components/ui/` | Design-system primitives |
| `client/src/hooks/` | Cross-feature hooks |
| `client/src/lib/` | Client utilities |
| `server/src/lib/` | Server utilities and infrastructure |
| `shared/api/` | Cross-side Zod schemas — the wire-format source of truth |

**2. The existing imports are grandfathered.** They are captured in
`scripts/feature-isolation-baseline.json` — **97 entries** (the 85 production imports plus
the 12 in test files, which are held to the same rule). They are not bugs to be fixed
today; they are debt with a known balance.

**3. New violations fail the check.** `scripts/check-feature-isolation.mjs` compares the
current scan against the baseline. Anything not in the baseline is an error. **The number
can only go down.**

**4. The four cycles are tracked as risks, not a project.** They get fixed opportunistically
when someone is already working in those files — never as a big-bang refactor. See
`RISK-001` in [risks-register](../../under-the-hood/risks-register.md).

**5. New modules start clean.** A module created after this date begins with zero outbound
cross-feature imports and is expected to stay that way. `features/compare/` (PRD-001) is
the first one this applies to.

---

## Alternatives considered

| Option | Why not |
|---|---|
| **Refactor all 85 now** | 85 imports across the roster, transaction, and scoring paths — mid-season, with real entry fees and payouts riding on the app. The risk is wildly out of proportion to the benefit, and the benefit is invisible to users. |
| **ESLint `no-restricted-imports` / `eslint-plugin-boundaries`** | The client has ESLint but no import rules; **the server has no ESLint configuration at all.** Getting enforcement on both sides through ESLint means standing up server linting first. A standalone script covers both today. Worth revisiting later. |
| **Just update the docs to list all 85 exceptions** | Documents the decay instead of stopping it. In six months there'd be 120. |
| **Do nothing** | The trajectory is the problem. 6 documented → 85 actual, with no forcing function to make the next 85 visible either. |

---

## Consequences

### Positive

- The violation count becomes a **number that can only decrease** — measurable, and visible in `docs/under-the-hood/stats.md`.
- Zero risk to running code. No app behaviour changes.
- The four cycles become visible every time someone touches those files.
- New feature work (starting with `compare`) gets boundaries for free.

### Negative

- **85 known violations stay in the codebase indefinitely.** This ADR does not fix them; it stops the bleeding. Anyone reading the code will still find `teams` importing from `transactions`.
- The baseline file needs regenerating whenever a violation is legitimately removed, or the check reports stale entries.
- A developer with a genuine need to cross a boundary now has friction. **That friction is the point**, but it will occasionally be wrong.

### Neutral

- The check is **not wired to CI by this ADR.** It runs on demand. Until it's wired in, it's a tool, not a gate.
  <!-- TODO(james): wire scripts/check-feature-isolation.mjs into .github/workflows/ci.yml.
       Until then the ratchet is voluntary, which historically means it decays. This is
       the single highest-leverage follow-up from this ADR. -->

---

## How to comply

**You need code from another feature.** Three options, in order of preference:

1. **Promote it to shared.** Best when it's genuinely general. Precedent: `StatsTables`.
2. **Duplicate it.** Two small similar functions in two modules beat one shared abstraction that fits neither. A little duplication is cheaper than a bad coupling.
3. **Add to the baseline, with a comment explaining why.** The escape hatch. Using it should feel slightly bad.

**Checking your work:**

```bash
node scripts/check-feature-isolation.mjs          # fails on anything new
node scripts/check-feature-isolation.mjs --report # full current graph
node scripts/check-feature-isolation.mjs --update-baseline  # after legitimately removing one
```
