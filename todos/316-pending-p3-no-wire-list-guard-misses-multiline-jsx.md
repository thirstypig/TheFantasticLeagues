---
priority: p3
issue_id: "316"
tags: [testing, copy]
dependencies: []
---

# `noWireListCopy` guard misses multi-line JSX text with punctuation

## Problem Statement

`client/src/__tests__/noWireListCopy.test.ts` guards the "Wire List" → "List" rename by scanning
source lines. Its second regex, for JSX text that sits on a line of its own, is:

```ts
/^\s*[^<>{}=;()"'`]*\bWire List\b/i
```

The character class excludes `( ) { } = ;` (and quotes / angle brackets) so that code lines don't
match. The side effect: a multi-line JSX text node containing any of those characters slips through.
For example, this would pass the guard:

```tsx
<p>
  Open your Wire List (period)
</p>
```

The first regex doesn't catch it either, because there is no quote or `>` before "Wire List" on that
line.

## Proposed Solutions

1. Parse instead of regex: walk `.tsx` files with the TypeScript compiler API (already a dev
   dependency) and check every `JsxText` node and string/template literal for `/\bwire list\b/i`.
   This removes both false negatives and the need for the code-line heuristic.
2. Cheaper: keep the regex but only exclude characters that can't appear in prose (`<>{}=;` and
   quotes), allowing `(` and `)`; add a fixture-based self-test for the parenthesis case.

Option 1 is the robust fix.

## Acceptance Criteria

- [ ] The guard flags `Open your Wire List (period)` as a multi-line JSX text node (self-test with an
      in-memory fixture, not a real source file).
- [ ] It still ignores code identifiers (`WireList`, `wireListApi`) and comments.
- [ ] `ListHelp.tsx` stays exempt; the current tree still passes.

## Work Log

- 2026-11-15: Found in the live meeting final review.
