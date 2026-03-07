---
status: complete
priority: p2
issue_id: "040"
tags: [code-review, typescript, quality]
dependencies: []
---

# Replace `catch (err: any)` with `catch (err: unknown)` (20+ occurrences)

## Problem Statement
All catch blocks use `catch (err: any)` which is unnecessary since the code only calls `String(err)`. Using `any` creates a precedent for unsafe property access without narrowing.

## Findings
- **Source**: kieran-typescript-reviewer
- **Location**: Every route handler in commissioner, admin, auth, waivers, trades, archive routes
- **Fix**: Mechanical find-replace, zero risk — `String(err)` works identically with `unknown`

## Acceptance Criteria
- [ ] All `catch (err: any)` replaced with `catch (err: unknown)`
- [ ] All tests pass
