---
status: complete
priority: p3
issue_id: "013"
tags: [code-review, quality]
dependencies: []
---

# Commissioner Page Uses Hardcoded Colors Instead of Design Tokens

## Problem Statement
`Commissioner.tsx` uses `text-white`, `bg-slate-950/60`, `font-bold` instead of design system tokens (`--lg-text-heading`, `--lg-tint`, `font-semibold`).

## Findings
- **Pattern Recognition**: Multiple lines use hardcoded colors
- **Architecture Strategist**: Confirmed `font-bold` violations (should be `font-semibold`)
- Pre-existing issue but file was modified in this PR

## Proposed Solutions
- Replace `text-white` → `text-[var(--lg-text-heading)]`
- Replace `bg-slate-950/60` → `bg-[var(--lg-tint)]`
- Replace `font-bold` → `font-semibold` per design system
- **Effort**: Small
