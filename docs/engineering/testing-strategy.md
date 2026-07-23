---
id: DOC-010
title: "Testing strategy (docs board)"
description: "Pointer to the main testing guide, plus the tests the docs system itself needs."
type: testing
status: active
phase: null
owner: james
tags: [testing, docs-system]
links: [DOC-007, DOC-001]
updated: 2026-07-23
---

# Testing strategy

> ## ⚠️ This is a pointer for the app's testing strategy
>
> The real guide is **[`docs/guides/testing-strategy.md`](../guides/testing-strategy.md)** —
> unit and integration tests, configuration, how to run them, coverage snapshot. It is
> linked from `CLAUDE.md` and is the document to edit.
>
> **2296 app tests** (1392 server main suite + 7 integration in the separate
> `db-integration` CI job + 897 client), plus 133 MCP tests run separately.
>
> This page adds only what that guide doesn't cover: **tests for the docs system itself.**

---

## What we test (app) — summary only

| Layer | Where |
|---|---|
| Unit, per feature module | `__tests__/` inside each feature |
| Integration | Separate `db-integration` CI job |
| Contract (cross-side schemas) | `shared/api/` — see `docs/CONTRACT_TESTING.md` |
| MCP servers | `mcp-servers/*/` — run separately |
| Browser verification | **Mandatory on any UI change.** Not optional, not replaceable by unit tests. |

---

## Tests the docs system needs

None of these exist yet. They cover the docs board's own logic — the parts that will
silently produce wrong output rather than crash.

### 1. Title extraction

| Case | Expected |
|---|---|
| Frontmatter `title:` present | Wins over everything |
| No frontmatter title, `# H1` present | H1 is used |
| Neither | Tidied filename |
| `# H1` present but **inside a fenced code block** | **Must be ignored** |

### 2. The code-fence guard — a real, currently-latent hazard

Strip fenced blocks before matching the H1:

```js
raw.replace(/```[\s\S]*?```/g, "")
```

**This is not hypothetical.** A scan of all 187 markdown files on 2026-07-23 found **5
docs** where the naive first-`#`-match lands inside a bash code fence:

| Doc | What the naive matcher picks up |
|---|---|
| `solutions/integration-issues/untyped-fetch-wrapper-api-contracts.md` | `✓ No errors` |
| `solutions/deployment/astro-github-pages-www-sitemap-and-ads-txt.md` | `Check if www redirects (and where to)` |
| `solutions/architecture/multi-phase-feature-completion-workflow.md` | `Expected: 1306 server + 893 client = 2199 total…` |
| `solutions/integration-issues/mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md` | `1. Fetch FG team stats for the period…` |
| `solutions/integration-issues/synthetic-merge-conflicts-from-parallel-refactor-on-main.md` | `zero conflicts — they touch AddDropPanel.tsx…` |

**All five are currently masked** because each carries a frontmatter `title:`, which the
viewer prefers. So this is a **latent** bug, not a live one — it bites the first doc that
lacks a frontmatter title and happens to have a `#` in a code fence.

That makes it exactly the kind of thing to fix with a test rather than a sighting: it will
reappear, and it will be invisible when it does.

### 3. Section grouping

- A doc files into the section implied by its `type`, not its folder.
- The `path → section` override map takes precedence for the exceptions.
- An unknown `type` falls through to a sensible default rather than vanishing.

### 4. Exclusions

- `docs/_templates/**` never appears on the board.
- Git-ignored files never appear.
- The board's glob covers every non-excluded docs folder — **including the three new ones**, which it currently does not.

### 5. Generated-doc freshness

- `stats.md`, `costs.md`, `system-status.md` regenerate deterministically.
- Re-running `docs:refresh` with no source changes produces **no diff** — otherwise every run creates noise and people stop running it.

---

## Ugly cases to fill in

*The list of things that have actually broken, or would break embarrassingly. Add to it
whenever one bites.*

- [ ] A doc with frontmatter but no `id` — indexed, or dropped silently?
- [ ] Two docs claiming the same `id`
- [ ] A `links:` entry pointing at an `id` that doesn't exist
- [ ] A tag not in the controlled vocabulary
- [ ] A doc whose `status: done` but whose linked to-do is still open
- [ ] A generated doc that someone hand-edited (their edit will be silently destroyed)
- [ ] `docs:refresh` run when `planning.json` is stale — does it say so, or quietly report old numbers?
- [ ] <!-- TODO(james) -->

<!-- Prompt-to-self: the last three are the dangerous ones — they all fail SILENTLY and
     produce output that looks right. Those deserve tests before the cosmetic cases. -->
