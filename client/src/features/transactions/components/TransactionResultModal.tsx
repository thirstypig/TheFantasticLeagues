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

import { useEffect } from "react";
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

export default function TransactionResultModal({ result, onClose }: Props) {
  // ESC closes the modal. Mirrors the SaveDiffPreviewModal a11y pattern.
  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, onClose]);

  if (!result) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transaction-result-title"
      data-testid="transaction-result-modal"
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
            autoFocus
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
}
