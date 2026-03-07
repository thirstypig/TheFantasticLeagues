---
status: complete
priority: p3
issue_id: "024"
tags: [code-review, quality]
dependencies: ["015"]
---

# Migrate Remaining Modules to asyncHandler Pattern

## Problem Statement
Error handling is split ~50/50 between `asyncHandler` wrapper (7 modules) and manual try/catch (8 modules). The `asyncHandler` approach prevents unhandled promise rejections and is shorter.

## Findings
- **Pattern Recognition**: 7 modules use `asyncHandler`, 8 use manual try/catch
- Modules using manual try/catch: admin, archive (20+ routes), auth, commissioner, keeper-prep, leagues, periods, players
- Modules using asyncHandler: auction, standings, teams, trades, transactions, waivers, roster

## Proposed Solutions
Migrate all manual try/catch routes to use `asyncHandler`. This pairs well with the error message leakage fix (015) — once a global error handler exists, `asyncHandler` routes automatically get safe error responses.

**Effort**: Medium (2-3 hours for all 8 modules)
**Depends on**: 015 (error message leakage fix should come first)

## Work Log
- 2026-03-06: Created from code review synthesis
