---
priority: p3
issue_id: 309
tags: [todos, hygiene, docs-system, tooling]
dependencies: []
---

## Problem Statement
Status lives in two places in `todos/` and they disagree. As of 2026-08-31, **89 of 303** files have
a filename saying `complete` while their frontmatter still says `status: pending`, and **2**
(`205-complete-p3-standings-mcp-tools.md`, `238-complete-p2-mcp-il-and-drop-transaction-tools.md`)
have an EMPTY `status:` and `priority:`.

**This is currently cosmetic, not a hidden backlog.** `scripts/refresh-docs.mjs:130` derives
open/closed purely from the filename (`f.split("-")[1] === "pending"`), so no generated count is
wrong. Verified by tracing #195: it was *born* as `195-complete-...` in PR #335 — written and closed
in one commit, with the template's `pending` frontmatter never edited.

The risk is a reader, not a report: any human or agent that opens a todo and reads its frontmatter
sees "pending" on 89 closed items. That is the inverse of the phantom-rename problem in
`feedback_phantom_rename_in_agent_prompts` — same root cause, mirrored.

## Proposed Solutions
**Delete the second source of truth rather than sync it.** Drop `status:` from the todo frontmatter
template entirely and let the filename be the only answer, since that is already what the tooling
reads. A one-off sweep to remove the key from all 303 files, plus fixing the 2 malformed
`priority:` values.

Alternative (worse): a script that rewrites frontmatter to match filenames. That keeps two sources
in sync by machine, which is strictly more machinery than having one source.

## Acceptance Criteria
- Exactly one source of truth for a todo's status; the other is removed, not synchronised.
- The 2 files with empty `priority:` are repaired.
- `refresh-docs.mjs` behaviour unchanged (counts identical before/after).
- If frontmatter `status:` is kept instead, a test fails when filename and frontmatter disagree.
- `git mv` this todo from pending → complete.

## Resources
- Found: 2026-08-30 todo review
- Related: `feedback_phantom_rename_in_agent_prompts` memory; todo #151 (nominally covers this, marked complete)

## Work Log

### 2026-08-31 — SHIPPED, via the recommended option (delete the second source)
- **`status:` removed from all 306 todo frontmatters that carried it.** The filename is now the
  only answer, which is already the only thing the tooling reads
  (`refresh-docs.mjs:130` and `:423`, both `f.split("-")[1] === "pending"`). Verified nothing else
  consumes it: the admin todo board reads `todos.json` and uses an entirely different vocabulary
  (`not_started | in_progress | done`).
- **Counts identical before and after: 308 files, 7 open.** That was the acceptance criterion.
- **The 2 "malformed" files were misdiagnosed in the problem statement above.** `205` and `238`
  did not have empty `status:`/`priority:` — they had **no frontmatter at all**, in two different
  bespoke formats. `238` was worse than recorded: its body read `**Status:** pending` while its
  filename said complete, which is the exact contradiction this todo is about. Both now carry
  proper frontmatter and the contradictory prose is gone.
- **A guard now stops it growing back.** `scripts/__tests__/refresh-docs.test.mjs` fails if any
  todo reintroduces a frontmatter `status:`, if one lacks frontmatter or a valid `priority:`, or
  if a filename's state segment is anything but `pending`/`complete`. **Verified it can fail** by
  reintroducing the drift on this very file — it named the offender — then reverting.
