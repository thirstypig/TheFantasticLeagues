---
status: complete
priority: p2
issue_id: "042"
tags: [code-review, security]
dependencies: ["019"]
---

# File Upload Missing MIME Type Validation

## Problem Statement
File upload endpoints (archive Excel import, commissioner roster CSV import) have size limits (todo 019) but no MIME type filtering. Users could upload arbitrary file types.

## Findings
- **Source**: security-sentinel
- **Locations**:
  - `server/src/features/archive/routes.ts` — Excel import accepts any file type
  - `server/src/features/commissioner/routes.ts` — CSV import accepts any file type
- **Impact**: Could lead to server-side processing of unexpected file formats

## Proposed Solutions

### Option A: Add multer fileFilter
```typescript
const upload = multer({
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    cb(null, allowed.includes(file.mimetype));
  }
});
```
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria
- [ ] Excel import only accepts `.xlsx` MIME types
- [ ] CSV import only accepts `text/csv` and `text/plain` MIME types
- [ ] Rejected files return 400 with appropriate error
