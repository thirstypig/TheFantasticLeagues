# Custom Slash Commands

Located in `.claude/commands/`. Run from Claude Code with `/<name>`:

| Command | Description |
|---------|-------------|
| `/check` | Run all tests + TypeScript checks in parallel |
| `/db <query>` | Run a Prisma database query (natural language) |
| `/feature-test <name>` | Run server + client tests for a feature module |
| `/feature-overview <name>` | Show files, routes, imports, tests for a feature |
| `/smoke-test` | Hit all API endpoints and report status codes |
| `/test-new <feature>` | Write unit/integration/E2E tests for a new feature, run them, update `docs/TESTING.md` |
| `/test-run [e2e\|<feature>]` | Run tsc + unit/integration (~10s). Add `e2e` for Playwright suite |
| `/test-audit` | Scan test-infra gaps (pre-commit hook, contract testing, CI, etc.) and recommend next investment |
| `/doc [context]` | Synchronize all docs atomically — CLAUDE.md, FEEDBACK, `docs/*`, TODO — with drift detection |
| `/ship <feature-name>` | Meta: runs `/test-new` → `/doc` → tsc+tests → commit in one flow. Kebab-case name required |

All five `test-*` + `/doc` + `/ship` also live at `~/.claude/commands/` so they work in every project.
