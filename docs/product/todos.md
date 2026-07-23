---
id: DOC-006
title: "To-dos (micro)"
description: "Immediate, actionable work. Pointer doc — the canonical source is the todos/ directory."
type: todos
status: active
phase: null
owner: james
tags: [league-admin]
links: [DOC-005, DOC-002]
updated: 2026-07-23
---

# To-dos (micro)

## What this page is, in plain English

This is **the near work** — small, specific, do-it-this-week items. Each one should be
finishable in a sitting or two. It answers *"what do I pick up next?"*

If an item is big enough to need a plan, it isn't a to-do — it's a
[roadmap](roadmap.md) item that needs a PRD first.

> ## ⚠️ This is a pointer, not the source
>
> The canonical to-dos live in the **`todos/` directory** at the repo root — one markdown
> file per item, each with its own frontmatter (`status`, `priority`, `issue_id`, `tags`,
> `dependencies`) and a Problem Statement / Proposed Solutions / Acceptance Criteria body.
>
> **Add and edit files in `todos/`, not this page.**

---

## Current state — 2026-07-23

**306 total · 296 complete · 10 open.**

### The 10 open items

| Priority | ID | Summary |
|---|---|---|
| **P1** | `298` | IL-fee reconciliation has **never run** for two closed periods — Postgres advisory-lock type error (`42883`). Money-adjacent. |
| **P1** | `299` | No ingestion-job run tracking or alerting |
| **P1** | `300` | No `syncedAt` timestamp on scoring tables |
| **P1** | `306` | Position player's mop-up pitching counted in team ERA/WHIP; OnRoto excludes it |
| **P2** | `301` | No periodic closed-period reconcile alarm |
| **P2** | `302` | Delete dead divergent scoring engine — **PR #413 is open** for this |
| **P2** | `303` | Retire the legacy waiver system |
| **P2** | `305` | Standings cold-compute serialized on a single connection |
| **P3** | `181` | `rosterVersion` etag cross-tab safety |
| **P3** | `304` | Cache refresh + vestigial cleanup |

*(Snapshot. Regenerate with `npm run docs:refresh` rather than hand-editing.)*

---

## The "done" convention

Same rule as the roadmap: **nothing moves to a separate folder when it's finished.**

The `todos/` directory implements this by renaming the file — `NNN-pending-*` becomes
`NNN-complete-*` — and updating the `status:` field in the frontmatter. Completed items
stay in the same directory forever, which is why there are 296 of them sitting alongside
the 10 open ones. That's correct: they're the project's memory of what was actually done.

### A fragility worth knowing about

**Status is recorded in two places** — in the filename (`298-pending-p1-…`) and in the
frontmatter (`status: pending`). Nothing enforces that they agree.

They can and do drift: an item gets marked complete in its frontmatter but the file never
gets renamed. This has needed cleanup sweeps more than once, and `todo 151` was itself
about exactly this problem.

<!-- TODO(james): worth deciding which one wins. The frontmatter is the more natural source
     (it's structured, and it's what a docs board would read); the filename is what's
     visible in `ls` and what people actually scan. Picking one and having docs:refresh
     flag disagreements would close this permanently. -->

---

## How a to-do relates to everything else

```
roadmap item  →  intake gate  →  PRD  →  to-dos
   (DOC-005)      (DOC-003)    (PRD-###)   (todos/)
```

Each to-do should be traceable up that chain: which PRD it serves, which roadmap item that
PRD came from.

**In practice most current to-dos don't have that link** — they came from code review,
audits, and incidents rather than from planned feature work. That's legitimate: bug fixes
inside locked scope skip the intake gate by design (see [DOC-003](feature-intake-rules.md)).
A to-do with no PRD link is fine **if** it's maintenance. A *feature* to-do with no PRD
link is a sign something bypassed the gate.
