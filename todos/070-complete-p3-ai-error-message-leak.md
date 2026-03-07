---
status: pending
priority: p3
issue_id: "070"
tags: [code-review, security]
dependencies: []
---

# AI Analysis Endpoints Leak Error Details

## Problem Statement
AI analysis error responses can include raw error messages from the Gemini API, including messages about API keys, rate limits, or internal configuration. The message "Gemini API key not configured. Add GEMINI_API_KEY to .env" is especially concerning.

## Findings
- **Security Sentinel**: Flagged at `server/src/services/aiAnalysisService.ts` lines 116, 125, 209
- Error messages passed through `err.message` to client responses
- Archive routes at lines 951-967 return the analysis service result directly

## Proposed Solutions

### Option A: Sanitize error messages
- Map all AI service errors to a generic "Analysis failed" message in the response
- Log the detailed error server-side
- **Effort**: Small | **Risk**: Low

## Technical Details
- **Affected files**: server/src/services/aiAnalysisService.ts, server/src/features/archive/routes.ts

## Acceptance Criteria
- [ ] No internal error details returned to clients from AI endpoints
- [ ] Detailed errors logged server-side
