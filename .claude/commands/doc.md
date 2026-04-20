Synchronize every project doc against recent changes, atomically.

The argument `$ARGUMENTS` is an optional short description of what to document (e.g. `contract testing pilot`, `session 69 wrap-up`, `watchlist bug fix`). If empty, infer from the last few commits / session transcript.

## Why this command exists

"Document the update" has too many ambiguous targets — README, CLAUDE.md, FEEDBACK, CHANGELOG, roadmap, per-feature docs, admin data files. Without a checklist, docs drift: CLAUDE.md says "20-game threshold" while code says 3, TESTING.md claims 822 tests while the real count is 823, ROADMAP shows an item as pending that shipped last week. This command turns "update the docs" into a deterministic sweep.

## Phase 1 — Discover the doc surface

Run these and build a *project-specific inventory*. **Only update files that actually exist.** Never create new top-level doc files without explicit user approval.

```bash
# Top-level docs
ls README.md CLAUDE.md FEEDBACK.md CHANGELOG.md ROADMAP.md TODO.md 2>/dev/null
# docs/ directory
ls docs/*.md 2>/dev/null
# Admin data files (project-specific — some projects back /todo /roadmap /changelog UIs with JSON)
find . -maxdepth 5 -type f \( -name "todos.json" -o -name "changelog.json" -o -name "roadmap.json" \) -not -path "*/node_modules/*" -not -path "*/dist/*" 2>/dev/null
```

Report the list back so the user can spot anything unusual. Classify each found file:

| Type | Purpose | Update style |
|---|---|---|
| README | External audience — what is this project? | Edit in place; only if top-level architecture changed |
| CLAUDE.md / AGENT.md / etc. | Agent/contributor conventions | Edit in place when conventions or architecture change |
| FEEDBACK.md / DIARY.md | Session log | **Append** a new entry; never edit past entries |
| CHANGELOG.md | User-visible release notes | **Append** under the right version — only user-facing changes |
| ROADMAP.md | Future plans | Check off shipped items; move deferred items to new sections |
| TODO.md | Active work queue | Add new items; mark completed |
| docs/*.md | Subsystem-specific references | Edit in place when that subsystem changes |
| `*.json` admin data | Backs admin UI pages | **Read current state before editing** — preserve IDs, timestamps, ordering |

## Phase 2 — Review what changed

```bash
git log --oneline -15
git diff HEAD~5..HEAD --stat
```

Read through recent commits. Classify each meaningful change:

- **Architectural / convention change** → CLAUDE.md (or equivalent agent handbook)
- **Subsystem internals** → the relevant `docs/*.md` (e.g. testing changes → `docs/TESTING.md`)
- **User-facing feature / bug fix / UI change** → CHANGELOG (if exists) + optionally README top-matter
- **Work completed or deferred** → TODO/ROADMAP
- **Session-level narrative** → FEEDBACK session entry
- **Nothing user-visible** → no CHANGELOG entry

**Never dump the full git log into a doc.** A doc entry is a curated story, not a diff.

## Phase 3 — Cross-reference verification

Before writing, read the doc files and check for **drift from reality**:

- Test counts in CLAUDE.md / TESTING.md should match `grep -c "✓" recent-test-output`.
- Architectural claims ("cron runs every 24h") should match the actual code.
- "Shipped" items in ROADMAP should have commits; "pending" items should not.
- Link integrity: if CLAUDE.md links to `docs/FOO.md`, that file must exist.

List each drift found. Fix them as part of this same update pass — do not leave known-wrong claims in place because "someone else" will fix them.

## Phase 4 — Write updates

For each doc that needs updating:

1. **Read the current file** in full before editing. Understand the structure and style — mimic it.
2. **Match tone and format** — some CLAUDE.mds are terse bullet lists, some are prose; some FEEDBACKs have specific section headers (Completed / Pending / Concerns / Test Results). Follow the existing pattern.
3. **Be specific** — "Session 69: fixed bugs and added tests" is useless. "Session 69: watchlist star missing on Players page because normalizeTwoWayRow stripped Player.id — fixed by adding id to passthrough; added 1 E2E test guarding it" tells the next reader what happened and why.
4. **Prefer edits in place** for reference sections. **Prefer appends** for session logs and changelogs.
5. **Date stamps**: use the current date (`YYYY-MM-DD` ISO format). Convert relative dates in the user's request ("last week", "Thursday") to absolute.

## Phase 5 — Report

Output exactly:

```
Docs updated:
  ✏️  CLAUDE.md              — <one-line reason>
  ✏️  docs/TESTING.md        — <one-line reason>
  ➕  FEEDBACK.md             — new session entry
  ⏭  README.md               — skipped (no top-level changes)
  ⏭  CHANGELOG.md            — skipped (none exists)

Drift found and fixed:
  - CLAUDE.md said "822 tests"; actual 823. Updated.
  - ROADMAP.md listed "E2E scaffold" as P2 backlog; now shipped. Moved to "Completed Session 69".

Drift found but NOT fixed (needs decision):
  - <item>: <reason why it needs user input>

Not committed. Review changes, then commit when ready.
```

## Phase 6 — Do NOT commit

This command only writes docs. It does not commit, push, or trigger tests. That's the calling session's job. The calling session is responsible for the test cadence (tsc + unit tests before commit, e2e before push).

## Guardrails

- **Don't create new top-level docs without explicit approval.** If the project has no CHANGELOG.md and the user hasn't asked for one, skip that step with a note. Offer to create it in your report; don't create unilaterally.
- **Don't touch generated files.** `dist/`, `.prisma/`, `*.lock`, `node_modules/`.
- **Don't rewrite history.** Past FEEDBACK entries, past CHANGELOG entries, past git commits — those are immutable facts of what happened. New info goes in new entries.
- **Don't pretend things are done that aren't.** If a feature is half-shipped, say so in the session entry. Better to flag "pending code review" than to mark something complete and create drift.
- **Don't inflate.** Small change, small entry. A typo fix doesn't need a CHANGELOG entry; a breaking rename does.
- **Don't duplicate.** If FEEDBACK has the full story, CLAUDE.md just needs the one-line architectural note that links to it. Don't copy the same 10 lines to three files.

## Project-specific overrides (FBST)

*Keep this section short. It's the only project-specific part of this prompt. When porting to another project, replace this section entirely or delete it.*

- Session log: **FEEDBACK.md** (not CHANGELOG) — follow the existing session-header format: `## Session YYYY-MM-DD (Session NN) — <short title>`.
- Session-state memory: write a companion memory file in `~/.claude/projects/<project>/memory/project_sessionNN_state.md` with a pointer in `MEMORY.md`. See session-end skill.
- Per-subsystem docs to check: `docs/TESTING.md`, `docs/RULES_AUDIT.md`, `docs/CONTRACT_TESTING.md`. Update the coverage / status lines at the top of these when relevant.
- Active roadmap lives in `TODO.md` (canonical) — `docs/ROADMAP.md` is historical and generally append-only.
- CHANGELOG.md does **not** exist. Do not create one unless the user explicitly asks.
- Admin UI pages `/todo`, `/roadmap`, `/changelog`, `/concepts` are API-backed (no JSON data file today). Skip them in the doc sweep.

## Portability note (delete this section when porting)

This prompt is written to be project-agnostic in Phases 1–6. Only the "Project-specific overrides" section above depends on FBST's particular structure. When adapting for a new project:

1. Copy this file to `<new-project>/.claude/commands/doc.md` (or `~/.claude/commands/doc.md` for a user-level command available everywhere).
2. Replace the "Project-specific overrides" section with that project's doc inventory.
3. Run `/doc` — it will auto-discover the rest.
