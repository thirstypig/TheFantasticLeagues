// client/src/features/transactions/components/TransactionResultModal.tsx
//
// Post-commit confirmation modal for roster transactions. Replaces the
// ephemeral toast pattern with an explicit-acknowledgment modal so the
// user can read the full result of a multi-step move (headline, primary
// action, auto-resolve cascade) and dismiss intentionally.
//
// Used by all six manual roster-move surfaces:
//   - Commissioner: Add/Drop, Place on IL, Activate from IL drawers
//   - Owner v3 hub: AddDropPanel, PlaceOnIlPanel, ActivateFromIlPanel
//
// NOT used by trade execution or wire-list processing — those have
// different result UX (async lifecycle / batch results screen).
//
// A11y contract (per todo #235): the modal declares aria-modal="true"
// and honors it via (1) createPortal to document.body so an ancestor's
// stacking context can never sandwich the dialog under sibling content,
// (2) focus trap — Tab and Shift+Tab cycle between the first and last
// focusable inside the dialog, (3) return-focus to whichever element
// opened the modal on dismiss, (4) scoped ESC handler attached to the
// dialog element (not window) so nested ESC-aware surfaces are not
// double-fired.

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { AppliedReassignment } from "@shared/api/rosterMoves";

export interface TransactionResult {
  /** Modal headline. e.g. "Claim succeeded", "IL activation complete". */
  title: string;
  /** Primary outcome line. e.g. "Andrew Vaughn returned to CM, Felix Reyes dropped". */
  primaryLine: string;
  /** Auto-resolve reassignments triggered by the headline move. Empty/undefined when none.
   *  Re-uses the canonical wire shape so the modal stays in lockstep with the server. */
  cascadeMoves?: ReadonlyArray<AppliedReassignment>;
}

interface Props {
  /** Null = closed. Populate to open. */
  result: TransactionResult | null;
  onClose: () => void;
}

// All elements that count as "tab-stoppable" within the dialog. Kept narrow
// — the only built-in focusable in this modal is the OK button, but the
// selector is here so future additions (a Link, an Input) "just work".
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function TransactionResultModal({ result, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Capture the element that had focus when we opened, then move focus to
  // the OK button. Restore on close. Both steps run synchronously in a
  // single layout effect so we don't race React's built-in `autoFocus`
  // (which would otherwise have already moved focus before our capture).
  useLayoutEffect(() => {
    if (!result) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
    // Find OK button (or first focusable) and focus it.
    const root = dialogRef.current;
    const firstFocusable = root?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();
    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, [result]);

  if (!result) return null;

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((el) => !el.hasAttribute("data-focus-sentinel"));
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !root.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transaction-result-title"
      data-testid="transaction-result-modal"
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        style={{
          background: "var(--am-surface-strong)",
          border: "1px solid var(--am-border-strong)",
          borderRadius: 18,
          padding: 24,
          maxWidth: 480,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          color: "var(--am-text)",
        }}
      >
        <h2
          id="transaction-result-title"
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            fontFamily: "var(--am-display)",
          }}
        >
          ✓ {result.title}
        </h2>

        <p style={{ margin: "12px 0 0 0", fontSize: 13.5, lineHeight: 1.5 }}>
          {result.primaryLine}
        </p>

        {result.cascadeMoves && result.cascadeMoves.length > 0 && (
          <div
            data-testid="transaction-result-cascade"
            style={{
              marginTop: 16,
              padding: "10px 12px",
              background: "var(--am-tint)",
              border: "1px solid var(--am-border)",
              borderRadius: 8,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--am-text-muted)",
                marginBottom: 6,
              }}
            >
              Auto-resolve also moved
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.6 }}>
              {result.cascadeMoves.map((m) => (
                <li key={m.playerId}>
                  <strong>{m.playerName}</strong>: <code>{m.oldSlot}</code> → <code>{m.newSlot}</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div
          style={{
            marginTop: 20,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            data-testid="transaction-result-close"
            style={{
              padding: "8px 20px",
              border: "none",
              borderRadius: 8,
              background: "var(--am-accent)",
              color: "white",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );

  // Portal escapes ancestor stacking contexts (CSS transform/filter/
  // will-change/etc.) that could otherwise scope `zIndex: 1000` and
  // sandwich the dialog under sibling content.
  return createPortal(modal, document.body);
}
