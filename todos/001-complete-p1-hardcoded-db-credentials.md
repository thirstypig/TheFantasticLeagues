---
status: complete
priority: p1
issue_id: "001"
tags: [code-review, security]
dependencies: []
---

# Hardcoded Production Database Credentials in Committed Script

## Problem Statement
`server/src/scripts/fix_2025_auction_values.js` contains a hardcoded Neon PostgreSQL connection string with full read/write production credentials. This is in git history and accessible to anyone with repo access.

## Findings
- **Security Sentinel**: Found at line 15 of the script file
- The DATABASE_URL contains username, password, and host for the production Neon database
- Even if the file is deleted, the credentials remain in git history

## Proposed Solutions

### Option A: Rotate credentials + remove file
- Rotate the Neon database password immediately
- Delete the script or replace hardcoded URL with `process.env.DATABASE_URL`
- Use BFG Repo Cleaner to scrub from git history if repo is shared
- **Effort**: Small | **Risk**: Low

## Technical Details
- **Affected file**: `server/src/scripts/fix_2025_auction_values.js`

## Acceptance Criteria
- [ ] Neon database password rotated
- [ ] Script uses `process.env.DATABASE_URL` instead of hardcoded value
- [ ] No hardcoded credentials in any committed files
