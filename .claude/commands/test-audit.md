Audit the test infrastructure against the "Beyond the basics" checklist in `docs/TESTING.md` and recommend the single highest-leverage next investment.

This is a **decision-support prompt**, not an install prompt. It produces a status table and a recommendation. The user decides whether to install anything.

## Scan

Detect the presence of each item by running specific checks. Do not speculate — if a check is ambiguous, mark it "unclear" and explain why in one line.

1. **Pre-commit hook**
   - `cat .claude/settings.json 2>/dev/null` — look for a `PreToolUse` hook matching `Bash` + `git commit`.
   - `ls .husky/pre-commit` — Husky-style git hook.
   - `ls .git/hooks/pre-commit` — native git hook (and not just `.sample`).
   - Present if any of the above run tsc or tests.

2. **Contract testing (shared Zod schemas client ↔ server)**
   - Grep for shared Zod imports across the client/server boundary: `grep -r "from.*shared.*schema\|../../shared" client/src server/src`.
   - Count how many API endpoints have a single source-of-truth schema used by both sides. 0 = absent. 1–3 = partial. All = present.

3. **Visual regression**
   - `grep -r "toHaveScreenshot" client/e2e` — Playwright screenshot assertions.
   - `ls client/e2e/__screenshots__ 2>/dev/null`.

4. **Mutation testing**
   - `grep -l "stryker" client/package.json server/package.json` or `ls stryker.conf.*`.

5. **CI pipeline**
   - `ls .github/workflows/*.yml 2>/dev/null`. Read the first one; confirm it actually runs `npm run test` or equivalent.

6. **Flaky test tracking**
   - `ls docs/FLAKES.md` or `grep -r "flaky\|.only\|skip" client/e2e/` — informal signals. Mostly will be absent.

7. **Test factories**
   - `ls server/src/__tests__/factories/ client/src/__tests__/factories/ tests/factories/ 2>/dev/null`.

## Report

Output exactly this shape:

```
Status vs. docs/TESTING.md "Beyond the basics":

✓ Pre-commit hook     — <one-line evidence>
✗ Contract testing    — <one-line evidence, or "N shared schemas / M endpoints">
✓ Visual regression   — <one-line evidence, or "N screenshots in /e2e/__screenshots__">
...

Recommended next: <item>.
  Why:      <one-sentence impact — ideally cites a real bug or gap this would prevent>.
  Cost:     <estimate — "1 session" / "10 min config" / "1 week incremental">.
  Trade-off: <what it complicates or what you lose>.
  Next step: <single sentence — what the user would say to start it>.
```

## Ranking rules (how to pick "Recommended next")

Prefer items that:

1. **Prevent a bug class we've actually shipped.** A contract testing recommendation that cites the session-69 `normalizeTwoWayRow` bug beats an abstract "coverage is good" pitch.
2. **Have the highest bug-prevention-per-hour ratio.** Pre-commit hook: 10 min to install, prevents most "forgot to run tests" commits — excellent ratio. Visual regression: 2 hours to wire + ongoing screenshot maintenance — only recommend when CSS drift has bitten you.
3. **Unblock later items.** CI pipeline should come before mutation testing and visual regression, because those are most valuable running on every PR, not just locally.

When the user hasn't installed anything, the typical order is: **pre-commit → CI → contract testing → test factories → visual regression → mutation testing → flaky tracking**.

## Guardrails

- **Don't install anything.** This prompt only reads and recommends. If the user says "do it" after seeing the report, run the appropriate install flow as a separate step.
- **Don't over-recommend.** One item at a time. A list of seven is a to-do, not a decision.
- **Cite concrete evidence.** "No shared schemas" is weak. "0 shared schemas; `normalizeTwoWayRow` bug would have been caught by one" is strong.
- **If everything is installed:** congratulate briefly and recommend running the existing tooling (mutation testing sweep, coverage report) rather than inventing new items.
