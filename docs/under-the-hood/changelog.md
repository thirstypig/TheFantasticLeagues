---
id: DOC-015
title: "Changelog (pointer)"
description: "What shipped, when. Pointer doc — the canonical changelog is docs/changelog.md."
type: changelog
status: active
phase: null
owner: james
tags: [docs-system]
links: [DOC-005, DOC-012]
updated: 2026-07-23
---

# Changelog

## What this is, in plain English

The record of **what shipped and when**. It is the honest answer to "have we actually made
progress?" — the one metric `stats.md` explicitly refuses to be.

> ## ⚠️ This is a pointer, not the source
>
> The canonical changelog is **[`docs/changelog.md`](../changelog.md)**, rendered in-app at
> **`/changelog`**. It was made a single source deliberately in **PR #423**, which removed a
> hardcoded duplicate array from the page component.
>
> **Add releases to `docs/changelog.md`.** Writing entries here instead re-creates exactly
> the drift that PR eliminated.

---

## Format used by the real changelog

```markdown
## v2.2.0 — 2026-07-06 — feature
### Email signup on the marketing site

- **Feature:** …what a user can now do, in their words…
```

Three things worth copying from the existing entries:

1. **Version, date, and kind on one line** — the `/changelog` page parses this.
2. **A human headline**, not a commit subject. "Email signup on the marketing site" beats `feat(subscribers): wire POST /api/public/subscribe`.
3. **Described from the user's side.** The current v2.2.0 entry says what a visitor can do and what is stored about them — not which router was mounted.

---

## When to append

- A **phase completes** — the roadmap's macro phases are the natural unit.
- A user-visible feature ships to production. *Shipped* means **verified live in prod**, not merged. Prod has frozen twice on migration failures while `main` looked healthy; confirm with the version check in [system-status](system-status.md).
- A fix lands that a user would notice or has complained about.

**Not** every merged PR. A changelog that lists every commit is a git log with worse formatting.

<!-- TODO(james): the changelog has no entries after v2.2.0 (2026-07-06), but #418-424
     shipped between then and 2026-07-23. Either those were internal-only (fine — say so
     by omission) or the changelog is behind. Worth one pass to decide. -->
