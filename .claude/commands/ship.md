Ship a feature end-to-end: run tests, sync docs, verify, commit. In one call.

The argument `$ARGUMENTS` is the **feature name** — short, imperative, kebab-case. Required. Examples: `watchlist-star-fix`, `commissioner-add-drop`, `contract-testing-pilot`. **Reject the command if no name is provided** — there's no way to thread a feature through tests, docs, and a commit message without one.

## Why this command exists

`/ship` is a meta-command that runs the full per-feature cadence (build → `/test-new` → `/doc` → pre-commit checks → commit) in one call. It's appropriate when:

- The feature is **small and well-scoped** (roughly ≤ 20 files, one feature module or tightly-related change).
- You've already built the feature and the code is ready.
- You don't want to chain four prompts manually.

It is **NOT appropriate** when:

- The diff spans many unrelated modules (should be multiple commits).
- There are schema migrations or dep updates mixed in with feature work (review separately).
- You're experimenting and not sure the change is shipping.
- The branch has other uncommitted work unrelated to this feature.

In those cases, run the phases one at a time and inspect between them.

## Phase 0 — Argument check

If `$ARGUMENTS` is empty or looks like a sentence ("fix the watchlist bug"), **stop** and ask the user for a proper kebab-case feature name.

```
✗ /ship needs a feature name. Example: /ship watchlist-star-fix
```

Do not proceed without one.

## Phase 1 — Pre-flight scope check

Run these and **inspect the result carefully** before moving on:

```bash
git status --short
git diff HEAD --stat
git log main..HEAD --oneline 2>/dev/null | head -5
```

Halt and ask for confirmation if ANY of these are true:

- More than 20 files changed.
- Changes span >3 feature modules (`client/src/features/*` or `server/src/features/*`).
- Schema files changed (`prisma/schema.prisma`, any `migrations/`).
- Dependency changes (`package.json`, `package-lock.json`) — ask whether they're part of the feature or unrelated.
- Untracked files that aren't screenshots/test-results — these might be WIP that belongs in the commit or belongs elsewhere.
- Uncommitted changes that seem outside the feature's scope.

Report what you see and let the user either confirm or split the scope.

## Phase 2 — Run tests via `/test-new <feature>`

Follow the `/test-new` prompt as if it were invoked. Write unit/integration/E2E tests as appropriate, execute them, and update `docs/TESTING.md`.

**If anything is red, halt.** Do not commit. Report the failure and exit. The user can fix and re-run `/ship`.

## Phase 3 — Sync docs via `/doc <feature>`

Follow the `/doc` prompt. Discover the project's doc surface, classify changes, update every relevant doc in sync. Check for drift in existing claims and fix it.

**If doc updates hit any ambiguity that needs user input**, halt and surface the question. Do not commit partial doc state.

## Phase 4 — Pre-commit verification

Per the project's saved rule, before any commit:

```bash
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit
npm run test
```

**If anything is red, halt.** Announce "red, fixing first" and list the specific failures.

## Phase 5 — Stage the change

Review what's about to go in:

```bash
git status --short
```

Stage explicitly by file — **never use `git add -A` or `git add .`**. Exclude:

- Screenshots (`*.png`) in the repo root.
- Log files.
- Any `node_modules/`, `dist/`, `.DS_Store`.
- Unrelated uncommitted changes from prior sessions (leave those for the user to decide).

Show the user what's staged with `git status --short` before committing.

## Phase 6 — Build the commit message

Follow the project's existing commit style (check `git log --oneline -5` to match). Use the **feature name as the title** and a concise body that explains:

1. **What** the feature is (one line).
2. **Why** the change was made (1–3 sentences — motivation, not diff summary).
3. **Key technical decisions** if any (one bullet each).
4. **Test changes** (what was added).
5. **Doc changes** (which docs were updated).

Template:

```
<type>: <feature-name in kebab-case> — <short description>

<1–3 sentence motivation/context>

<optional: bullets of key technical decisions>

Tests: <counts added>. Unit/integration baseline: <X passing>.
Docs: <which files were updated and why, 1 line each>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Use `<type>` from: `feat` (new capability), `fix` (bug), `refactor` (no behavior change), `docs` (docs only), `test` (tests only), `chore` (deps/infra).

## Phase 7 — Commit

Use a HEREDOC to preserve message formatting. Do **not** use `--amend`, `--no-verify`, or any history-rewriting flag.

## Phase 8 — Report

Output exactly:

```
Shipped: $ARGUMENTS
  Commit:    <hash> <title>
  Files:     <N> changed, +<added>/-<removed>
  Tests:     <before> → <after> passing (<delta> added)
  Docs:      <N> files updated
  Branch:    <current branch>, <N> ahead of origin

Not pushed. Run `git push` when ready. Run /test-run e2e first if the change touches user flows.
```

## Hard guardrails

Listed in priority order — violations mean this command has failed.

- **Never commit without a feature name.** Phase 0.
- **Never commit red tests.** Phase 4.
- **Never `git add -A` or `git add .`.** Phase 5.
- **Never push.** Even on success, push is a separate explicit user action.
- **Never amend commits or rewrite history.**
- **Never `--no-verify`.** If a hook fails, fix the underlying issue.
- **Never silently swallow a phase failure.** Halt and report.
- **Never ship a sprawling diff.** If pre-flight says the scope is too big, refuse and suggest splitting.
- **Never create top-level docs you weren't told to create** (`CHANGELOG.md`, `ARCHITECTURE.md`, etc.). `/doc` already guards this — `/ship` inherits the rule.

## On failure

If any phase fails, leave the working tree exactly as you found it for that phase — except any docs/test files that were already written before the failure (those stay; they're usable work). Report:

```
✗ /ship halted at Phase <N>: <what failed>
  What's saved:   <files that were successfully written>
  What's pending: <next step the user needs to take>
  To resume:      <literal command or action>
```

## Portability note

This prompt references `/test-new` and `/doc`, which must exist in the same project (either `.claude/commands/` or `~/.claude/commands/`). It also assumes the project has:

- `git` (for history and staging).
- A `package.json` with a `test` script (Phase 4 invokes `npm run test`).
- A client/server split with `npx tsc --noEmit` available in both. If your project is single-package, simplify Phase 4 to one tsc call.

Adjust Phase 4 commands if the project uses a different test runner (Jest, Mocha, Cargo test, `pytest`, etc.). Everything else is portable.
