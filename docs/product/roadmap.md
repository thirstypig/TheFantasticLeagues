---
id: DOC-005
title: "Roadmap (macro)"
description: "Long-term direction. Pointer doc — the canonical source is server/data/planning.json."
type: roadmap
status: active
phase: null
owner: james
tags: [league-admin]
links: [DOC-006, DOC-002, DOC-003]
updated: 2026-07-23
---

# Roadmap (macro)

## What this page is, in plain English

This is the **long view** — the things we might build over months, grouped into phases.
It answers *"where is this product going?"*, not *"what am I doing today."* For today's
work, see [to-dos](todos.md) (DOC-006).

> ## ⚠️ This is a pointer, not the source
>
> The canonical roadmap lives in **`server/data/planning.json`** and is rendered in-app at
> **`/roadmap`**. That was made the single source of truth deliberately in **PR #424**
> (2026-07-11).
>
> **Edit the JSON, not this page.** A second hand-maintained roadmap is exactly the thing
> that PR set out to eliminate.

---

## Structure of the real roadmap

`planning.json` holds two different things, which is worth knowing before you open it:

| Key | What it is |
|---|---|
| `roadmap` | **5 macro phases** — the long view. Each has a timeframe and a list of items. |
| `categories` | **10 working categories** with 82 concrete tasks and per-task `status`. This is the closer-in work. |

### The 5 macro phases

| Phase | Timeframe | Items |
|---|---|---|
| **Engagement & Remote UX** | April – September 2026 | 6 |
| **Paid APIs & Data Integrations** | Summer 2026 | 4 |
| **Scoring & Format Expansion** | Late 2026 | 6 |
| **Monetization & Growth** | 2026 launch work | 4 |
| **Platform Evolution** | 2027+ | 5 |

### The 10 working categories

| Category | Tasks | Done | Not started | In progress |
|---|---|---|---|---|
| `content` | 28 | 5 | 23 | — |
| `roster-management` | 14 | 12 | 2 | — |
| `code-quality-review` | 9 | 5 | 4 | — |
| `monetization` | 8 | — | 8 | — |
| `features` | 5 | — | 5 | — |
| `deployment` | 4 | 1 | 1 | 2 |
| `mid-season` | 4 | — | 4 | — |
| `growth` | 4 | 1 | 3 | — |
| `code-quality` | 4 | 2 | 2 | — |
| `operations` | 2 | 1 | 1 | — |

*(Counts read from `planning.json` on 2026-07-23. They are a snapshot — regenerate with
`npm run docs:refresh` rather than hand-editing.)*

---

## Honest observation

`planning.json` carries `updatedAt: 2026-05-19`. It was declared the canonical roadmap
source on **2026-07-11** (PR #424), but its **contents haven't been touched since May** —
roughly two months of shipped work isn't reflected in it.

Declaring a source canonical and keeping it current are two different jobs. The first was
done; the second wasn't.

<!-- TODO(james): reconcile planning.json against what actually shipped since 2026-05-19
     (the doc-management work #420–424, the audit tooling #418–422, email signup #415).
     Otherwise the in-app /roadmap page is confidently showing a stale picture. -->

---

## The "done" convention

**Nothing moves to a separate file when it's finished.** A completed item stays exactly
where it is and changes its `status` to `done`. "Done" is a saved filter, not a folder.

Two reasons this matters: a moved item loses its links, and a roadmap you can't see the
history of stops being useful for judging how fast things actually go.

---

## How a roadmap item becomes real work

1. It gets logged here (usually as the result of a **"not yet"** from the
   [intake gate](feature-intake-rules.md)).
2. When it comes up for consideration, it goes through the five intake questions.
3. If it clears, it earns a **PRD** in `docs/product/prds/` and gets linked from the
   roadmap item.
4. The PRD's implementation work is broken into [to-dos](todos.md).

Each layer links to the one above it. That chain is the traceability — you should always be
able to get from a line of work back to the problem it was meant to solve.
