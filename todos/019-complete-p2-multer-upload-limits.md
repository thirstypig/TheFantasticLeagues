---
status: complete
priority: p2
issue_id: "019"
tags: [code-review, security]
dependencies: []
---

# Add Multer File Upload Size and Type Limits

## Problem Statement
All three multer configurations lack file size limits and file type validation. A single large upload can crash the server (OOM for memory storage) or fill disk (for disk storage). This is a denial-of-service vector.

## Findings
- **Security Sentinel**: Flagged all 3 multer instances
- Locations:
  1. `server/src/features/archive/routes.ts:23` — disk storage, no limits (should only accept .xlsx)
  2. `server/src/features/roster/rosterImport-routes.ts:10` — memory storage, no limits (should only accept .csv)
  3. `server/src/features/commissioner/routes.ts:11` — memory storage, no limits

## Proposed Solutions

### Option A: Add limits and fileFilter to each multer instance (Recommended)
```typescript
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    cb(null, allowed.includes(file.mimetype));
  },
});
```

**Pros**: Prevents OOM and disk exhaustion. Rejects unexpected file types.
**Cons**: None.
**Effort**: Small (30 min)
**Risk**: None

## Acceptance Criteria
- [ ] All multer instances have `limits.fileSize` set (10MB max)
- [ ] All multer instances have `fileFilter` restricting MIME types
- [ ] Upload error handling returns 400 for oversized/wrong-type files
- [ ] Tests pass

## Work Log
- 2026-03-06: Created from code review synthesis
