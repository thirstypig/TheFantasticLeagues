Run the session start checklist from CLAUDE.md:

1. Read CLAUDE.md — confirm current architecture and conventions
2. Check FEEDBACK.md — review any open items from previous sessions
3. Run `npm run test` — verify all tests pass before making changes
4. Run `git log --oneline -10` — understand recent changes
5. Check for open TODOs — `grep -r "TODO\|FIXME\|HACK" server/src/ client/src/ --include="*.ts" --include="*.tsx" | head -20`

Report a summary of the current state: test results, any failing tests, recent commits, and any open feedback items.
