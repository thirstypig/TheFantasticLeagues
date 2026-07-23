---
id: DOC-001
title: "How this doc system works"
description: "The map — frontmatter schema, ID scheme, controlled tags, and where each kind of doc lives."
type: doc
status: active
phase: null
owner: james
tags: [docs-system]
links: []
updated: 2026-07-23
---

# How this doc system works

This is the map. Read this first; everything else in `/docs` follows the rules below.

The goal is a **browsable internal knowledge base**, not a folder of files. The in-app
board at `/docs` reads each file's metadata — never its filename — so a doc is only as
findable as its frontmatter block.

---

## 1. The frontmatter block

Every **authored** doc opens with this YAML block. No exceptions. A file without it still
exists on disk, but the board cannot index it, filter it, or link to it.

```yaml
---
id: PRD-001                     # stable ID — never reused, never renumbered
title: "Human-readable title"   # what the board shows in the sidebar
description: "One line. What this doc is for."
type: prd                       # see the type list below
status: draft                   # draft | active | locked | done | deprecated
phase: null                     # build phase this relates to, or null
owner: james
tags: []                        # from the controlled vocabulary ONLY — see below
links: []                       # IDs of related docs — this is the traceability
updated: 2026-07-23
---
```

### Field notes

| Field | Rule |
|---|---|
| `id` | **Stable forever.** If a doc is superseded, mark it `deprecated` and link forward — never recycle the number. |
| `title` | Required. The board falls back to the first `# H1`, then to a tidied filename, but set it explicitly. |
| `description` | Required. One sentence, no markdown. This is the blurb under the sidebar entry. |
| `type` | Controls which section the doc files into. One value only. |
| `status` | Describes **the document**, not the feature it describes. See the split below. |
| `phase` | Free-form string matching a real project phase (`"Phase 3.5"`), or `null`. |
| `owner` | Currently always `james` — solo project. Kept for when that changes. |
| `tags` | Zero or more, drawn **only** from the controlled list. Freeform tags are how search rots. |
| `links` | Other doc `id`s. This is what makes the board a graph instead of a pile. |
| `updated` | `YYYY-MM-DD`. Bump it when you meaningfully edit. |

### `status` describes the doc — `feature_status` describes the feature

These are genuinely different things, and conflating them produces lies. A PRD can be a
trustworthy, current document (`status: active`) about a feature that does not exist yet
(`feature_status: planned`).

So `type: prd` docs carry one extra optional field:

```yaml
feature_status: shipped     # shipped | in-progress | planned | abandoned
```

The board renders this as a separate badge. Only PRDs use it.

| `status` value | Means |
|---|---|
| `draft` | Being written. Do not rely on it. |
| `active` | Current and trustworthy. The default for a finished doc. |
| `locked` | Frozen by process — changing it requires the feature-intake gate. |
| `done` | The work it describes is complete. **Nothing moves to a separate folder** — "done" is a status, surfaced as a saved filter. |
| `deprecated` | Superseded or wrong. Keep the file, link forward to what replaced it. |

---

## 2. ID scheme

One number block per document family. Numbers are assigned in order and never reused.

| Prefix | For | Lives in |
|---|---|---|
| `PRD-###` | Product requirement docs — one per feature | `docs/product/prds/` |
| `ADR-###` | Architecture decision records — big, costly-to-reverse calls | `docs/engineering/adrs/` |
| `DOC-###` | Everything else authored | anywhere |
| `RISK-###` | Entries in the risks register | `docs/under-the-hood/risks-register.md` |
| `EXP-###` | Experiments closing the loop on a PRD hypothesis | `docs/under-the-hood/experiment-log.md` |

`RISK-###` and `EXP-###` are **row IDs inside a table**, not separate files. `PRD-###` and
`ADR-###` are one file each.

> **Note on ADR numbering:** this project already refers to `ADR-013` and `ADR-014` in
> `CLAUDE.md` (stat attribution, and closed-period reconciliation). Those decisions are
> real and were made; the ADR *files* were never written. New ADR files must therefore
> start at **ADR-015** to avoid colliding with those existing references.
>
> <!-- TODO(james): decide whether to back-fill ADR-001..014 as real files, or leave them
>      as CLAUDE.md references and start the folder at ADR-015. -->

---

## 3. Controlled tag vocabulary

**15 tags. This is the whole list.** Adding a tag is a deliberate act — edit this file
first, then use it. Never invent one at write time; that is exactly how a tag system
decays into a second, worse search box.

> **Amendment log.** `players` was added on 2026-07-23 while writing PRD-001: the scouting
> surfaces (search, detail, compare, watchlist, trading block) had no home in the original
> 14. Recorded here rather than silently widened — that is the process working, and every
> future addition gets a line in this block.

### Domain — what part of the product

| Tag | Covers |
|---|---|
| `scoring` | Standings, roto categories, periods, stat attribution, the scoring engine |
| `roster` | Lineups, slots, position eligibility, IL/minors, roster limits |
| `players` | Player search, detail, comparison, watchlist, trading block — the scouting surfaces |
| `transactions` | Add/drop, waivers, wire list, trades, trading block |
| `draft` | Auction draft, snake draft, keepers |
| `league-admin` | Commissioner tools, period close/rollover, entry fees, payouts, audit log |
| `data-sync` | MLB StatsAPI ingestion, player sync, stat backfills, news/RSS feeds |
| `multi-sport` | NBA/NFL surfaces and the sport-agnostic refactor |
| `ai` | The LLM-backed features — draft reports, bid advice, digests, trade analysis |

### Platform — how it's built and run

| Tag | Covers |
|---|---|
| `auth` | Supabase auth, sessions, roles, league permissions |
| `database` | Prisma schema, migrations, query patterns, the three-database setup |
| `deploy` | Railway, CI, the release/verify pipeline, environment config |
| `testing` | Test strategy, fixtures, coverage, contract tests |
| `design-system` | Score Sheet UI, shared components, mobile shell |
| `docs-system` | This board and its tooling (meta) |

### Deliberately **not** tags

- `marketing` — the marketing site lives in the sibling `thefantasticleagues-www` repo.
  This board indexes *this* repo. Add it only if marketing docs move here.
- `bug`, `urgent`, `wip` — these are `status`, not tags.
- Anything naming a single file, branch, or PR — that is what `links` is for.

---

## 4. The `type` list

`type` determines which section of the board a doc files into. Filing is **by intent, not
by folder** — a doc's location on disk is a convenience; its `type` is the truth.

**Authored types (from this doc system):**
`prd` · `launch-spec` · `intake-rules` · `glossary` · `roadmap` · `todos` · `adr` ·
`tech-spec` · `api-docs` · `decision-log` · `testing` · `component-lib` · `changelog` ·
`risk` · `experiment` · `privacy` · `runbook` · `doc`

**Types for content that already exists in this repo** — added so the 150+ existing docs
can be retrofitted rather than orphaned:
`solution` (the 68 files in `docs/solutions/`) · `guide` (`docs/guides/`) ·
`report` (audits in `docs/reports/`) · `plan` (in-flight plans) · `note` (scratchpad)

**Generated types** — never hand-edit a file carrying one of these; it will be overwritten:
`stats` · `costs` · `status` (by `npm run docs:refresh`) · `inbox` (by `node scripts/sync-inbox.mjs`)

---

## 5. Where things live, and why

Sections are organised by **the question a reader is asking**, not by file type. Order runs
most-referenced first, foundations at the bottom.

| Section | The question it answers | Contains |
|---|---|---|
| **Product** | What are we building, and why? | PRDs, launch spec, intake rules, roadmap, to-dos |
| **Engineering** | How is it built? | ADRs, tech spec, API docs, testing strategy, decision log |
| **Under the hood** | How is it doing? | Stats, costs, system status, changelog, risks, experiments, runbook, privacy |
| **Troubleshooting** | This broke — has it broken before? | `docs/solutions/` — 68 solved-problem writeups |
| **Foundations** | What does this word mean? What are the rules? | Glossary, guides, design system, conventions |

<!-- TODO(james): a Marketing section and a Prompt Library section were in the original
     spec. Marketing content lives in the www repo; prompt content currently lives inline
     in server/src/features/ai/. Neither has docs in this repo yet — decide whether to
     bring them in before adding empty sections. -->

---

## 6. Pointer docs

Three docs in the new structure are **pointers**, not content. They carry frontmatter so
the board indexes them, but the real content lives elsewhere and is already wired into the
running app:

| Pointer | Real source | Why |
|---|---|---|
| `docs/product/roadmap.md` | `server/data/planning.json` | Declared the canonical roadmap status source in PR #424 |
| `docs/product/todos.md` | `todos/*.md` | 300+ existing todo files with their own IDs and status |
| `docs/under-the-hood/changelog.md` | `docs/changelog.md` | Single-sourced into the live `/changelog` page in PR #423 |

Forking any of these creates a second source of truth. Don't.

---

## 7. Honesty conventions in doc bodies

Retroactive docs — PRDs reconstructed from already-shipped code — tag every claim inline:

- `[intended]` — plausibly a deliberate up-front decision, with a stated reason for thinking so.
- `[inferred]` — reconstructed from the code. A reasonable read, not a known fact.
- `[unknown]` — the code can't tell us. **Ask, don't invent.**

A doc full of `[unknown]` flags is a success, not a failure — those are the questions worth
surfacing. Never fabricate a KPI, metric, or intent to make a document look complete.

---

## 8. The comment model

Comments are how a doc gets corrected by someone who knows better than the person who wrote
it. The loop only works if comments **clear** — an inbox that only grows gets ignored, and
then the whole mechanism is dead.

### Shape of a comment

| Field | Values | Notes |
|---|---|---|
| `id` | `C-###` | Stable. Never reused. |
| `doc` | a doc `id` (e.g. `PRD-001`) | What it's a comment *on* |
| `path` | repo-relative file path | Redundant with `doc`, but survives an id change |
| `anchor` | free text (e.g. `"§5 Impact & KPIs"`) | Optional. Which part of the doc. |
| `kind` | `question` · `change_request` · `note` | See below |
| `status` | `open` → `in_review` → `resolved` | One direction only |
| `author` | who raised it | |
| `created` | ISO timestamp | Drives newest-first ordering |
| `resolution` | `null`, or `{ note, link, resolvedAt, resolvedBy }` | **Required** to move to `resolved` |

### The three kinds, and what each obliges you to do

| Kind | Means | Your obligation |
|---|---|---|
| **`change_request`** | The doc is **wrong** or must change | Act on it — edit the doc. Highest priority; pinned to the top of the inbox. |
| **`question`** | Someone needs information the doc doesn't give | Answer it. Often the answer belongs *in the doc*, in which case answering also means editing. |
| **`note`** | An observation. No action implied. | Acknowledge and resolve. Notes that keep recurring are a signal the doc has a gap. |

### Resolving

A comment moves to `resolved` only with a **resolution note and a link** — a commit SHA, a
PR number, or the doc `id` where the answer now lives.

> **"I fixed it" without a link is not a resolution.** Six months later nobody can tell
> whether it was genuinely handled or just closed to clear the list. The link is the whole
> point.

### The ritual

At the **start of a session**, read [`INBOX.md`](INBOX.md):

1. Act on `change_request` items first — they mean a doc is actively wrong.
2. Answer `question` items, putting the answer in the doc where it belongs.
3. Write a resolution (`status → resolved`, note + link) so the item clears and shows as
   resolved in the admin UI.

Regenerate the inbox with `node scripts/sync-inbox.mjs`.

---

## 9. Rendering caveat (current, temporary)

The board at `/docs` discovers markdown through a fixed glob list in
`client/src/pages/Docs.tsx`. It currently covers `docs/*.md`, `docs/guides/`,
`docs/reports/`, `docs/runbooks/`, `docs/learnings/`, `docs/solutions/**`, and four root
files.

The new `docs/product/`, `docs/engineering/`, and `docs/under-the-hood/` folders are **not
yet in that list**, so their contents will not appear on the board until it is extended.
`docs/_templates/` must stay excluded permanently.

<!-- TODO(james): follow-up PR — extend the glob; teach the viewer to read
     id/type/status/feature_status; strip fenced code blocks before H1 matching
     (raw.replace(/```[\s\S]*?```/g, "")) so a `# comment` inside a bash block cannot
     become a doc title; group sections by `type`. Requires touching app code. -->
