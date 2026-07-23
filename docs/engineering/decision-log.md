---
id: DOC-009
title: "Decision log"
description: "Running one-line log of small technical calls. Big ones get an ADR instead."
type: decision-log
status: active
phase: null
owner: james
tags: [docs-system]
links: [ADR-015, DOC-007]
updated: 2026-07-23
---

# Decision log

**One line per decision: date · decision · why.** Newest at the top.

This is for the **small** calls — the ones you'd otherwise re-litigate in three months
because nobody remembers why. Naming, a library choice, a convention, a workaround.

**If reversing it would take a week, it's not a log entry — it's an
[ADR](adrs/).** The test is cost-to-reverse, not how clever the decision was.

<!-- Prompt-to-self: the value here is entirely in LOW FRICTION. A one-line entry written
     in ten seconds beats a paragraph never written. Resist the urge to make rows
     thorough — thoroughness belongs in an ADR. -->

---

| Date | Decision | Why |
|---|---|---|
| 2026-07-23 | Docs board frontmatter keeps `title` + `description` alongside the new `id`/`type`/`status` fields | The existing `/docs` viewer reads exactly those two; dropping them would blank every sidebar entry |
| 2026-07-23 | New ADR files start at **ADR-015** | `ADR-013` and `ADR-014` are already cited in `CLAUDE.md` as real decisions whose files were never written; starting at 001 would collide |
| 2026-07-23 | `roadmap.md`, `todos.md`, `under-the-hood/changelog.md` are **pointer docs**, not copies | Their canonical sources are already wired into the live app (PR #423, #424); forking them re-creates the exact problem those PRs fixed |
| 2026-07-23 | Feature isolation enforced by a **ratchet**, not a refactor | 85 violations across roster/transaction/scoring paths, mid-season, with real money in play — see [ADR-015](adrs/ADR-015-feature-module-boundaries.md) |

---

## Backfill candidates

Decisions visible in the codebase whose reasoning lives only in `CLAUDE.md`, memory, or
someone's head. Each is a one-liner someone will otherwise have to reconstruct:

| Decision | Where the reasoning currently lives |
|---|---|
| `.aurora-theme` / `--am-*` token names kept after the Score Sheet redesign | `CLAUDE.md` — renaming needs a full sweep of hundreds of call sites |
| Mobile twin pages via `MobileLayoutGate` rather than duplicated routes | `CLAUDE.md` |
| `shared/api/` needs `"type": "module"` in its package.json | A solutions doc — without it Node ESM treats the files as CJS |
| Use `type` intersections, not `interface extends`, for discriminated-union rows | A feedback memo — `extends` collapses the union |
| Never `CREATE INDEX CONCURRENTLY` in a Prisma migration | `CLAUDE.md` + a solutions doc — froze prod for 21 h |
| `DATABASE_URL` **and** `DIRECT_URL` both on the pooler with `connection_limit=1` | A setup memo — free-tier direct connection is IPv6-only and fails from Railway |
| The chat REST router is commented out in `index.ts` while chat runs over WebSocket | Nowhere — is this dead code or deliberate? |

<!-- TODO(james): these are worth backfilling as one-liners with their dates. The last one
     (chat router) isn't a backfill — it's an open question I couldn't answer from the code. -->
