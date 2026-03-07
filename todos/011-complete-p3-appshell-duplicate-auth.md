---
status: complete
priority: p3
issue_id: "011"
tags: [code-review, simplicity]
dependencies: []
---

# AppShell Duplicates Auth State from AuthProvider

## Problem Statement
AppShell independently fetches `/auth/me` and manages its own auth state instead of using `useAuth()`, causing double API calls on page load and inconsistent logout behavior.

## Findings
- **Code Simplicity**: ~20 LOC of duplicated auth logic
- Logout bypasses Supabase `signOut()`, calling server-side endpoint directly
- Also has YAGNI sidebar resize feature (~25 LOC) and confusing triple sidebar state

## Proposed Solutions
- Use `useAuth()` hook instead of independent auth fetching
- Remove sidebar resize drag handle
- Simplify sidebar visibility to single state
- Remove `loginWithGoogleCredential` shim from AuthProvider
- **Effort**: Small | ~60 LOC reduction
