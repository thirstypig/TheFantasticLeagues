---
status: complete
priority: p3
issue_id: "012"
tags: [code-review, simplicity]
dependencies: []
---

# RulesEditor: Derive `grouped` State with useMemo

## Problem Statement
`RulesEditor.tsx` stores both `rules` (flat array) and `grouped` (by category) in state, creating sync risk. `grouped` is always derivable from `rules`.

## Findings
- **Code Simplicity**: Replace `useState` with `useMemo` for ~10 LOC reduction
- **TypeScript Reviewer**: Also flagged `pendingChanges` key type mismatch (number keys in `Record<string, string>`)

## Proposed Solutions
- `const grouped = useMemo(() => rules.reduce(...), [rules])`
- Change `pendingChanges` type to `Record<number, string>`
- Rename `RenderInput` to lowercase `renderInput` (it's a helper, not a component)
- **Effort**: Small
