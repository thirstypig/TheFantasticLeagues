---
status: complete
priority: p2
issue_id: "235"
tags: [code-review, pr-359, a11y, transactions]
dependencies: []
---

# Focus trap + portal + return-focus for `TransactionResultModal`

## Problem Statement

`TransactionResultModal` declared `aria-modal="true"` but did not enforce the
contract: no focus trap, no portal, no return-focus, window-scoped ESC handler.

## Resolution

- **createPortal** — modal now renders to `document.body`, immune to ancestor
  stacking contexts that could scope `z-index: 1000`.
- **Focus trap** — `onKeyDown` on the dialog div intercepts Tab and Shift+Tab,
  cycling focus between the first and last focusable inside the dialog.
- **Return-focus on dismiss** — `useLayoutEffect` captures
  `document.activeElement` before moving focus to the OK button, then
  restores it in cleanup. Critical detail: removed React's `autoFocus` prop
  in favor of an explicit `focus()` call in the same effect — `autoFocus`
  runs during the commit phase BEFORE `useEffect`, which would have caused
  the capture to record the OK button instead of the opener.
- **Scoped ESC** — ESC handler now attached to the dialog element via
  `onKeyDown` with `e.preventDefault()` + `e.stopPropagation()`. No more
  window-scoped listener; no double-fire with nested ESC-aware surfaces.

## Side benefit

Closed todo #237 (dedicated test file) in the same PR — the new a11y
behaviors warrant tests, and adding them now both validates the fix and
satisfies the standalone test ask.

## Resources

- PR: `feat/transaction-result-modal-a11y`
- Code: `client/src/features/transactions/components/TransactionResultModal.tsx`
- Tests: `client/src/features/transactions/components/__tests__/TransactionResultModal.test.tsx`
- Precedent referenced: `SaveDiffPreviewModal.tsx`
