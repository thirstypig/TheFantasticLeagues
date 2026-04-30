// client/src/features/transactions/components/SwapMode/SwapActionBar.tsx
//
// Pinned bottom action bar — pending swap counter, Reset, and Save.
// Pure UI; PR2 will wire onSave to POST /api/teams/:teamId/lineup and
// onReset to a swap-queue context reset.

import { CSSProperties } from "react";

export interface SwapActionBarProps {
  pendingCount: number;
  onReset?: () => void;
  onSave?: () => void;
  /** Disable both buttons during submission. */
  busy?: boolean;
}

const buttonBase: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "10px 18px",
  borderRadius: 12,
  cursor: "pointer",
  border: "1px solid var(--am-border-strong)",
  transition: "transform 120ms ease, box-shadow 200ms ease, opacity 200ms ease",
};

export function SwapActionBar({ pendingCount, onReset, onSave, busy }: SwapActionBarProps) {
  const hasPending = pendingCount > 0;
  return (
    <div
      role="region"
      aria-label="Swap mode actions"
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 5,
        marginTop: 16,
        padding: 12,
        background: "var(--am-surface-strong)",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        border: "1px solid var(--am-border-strong)",
        borderRadius: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        boxShadow: "0 12px 30px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.06) inset",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
          color: hasPending ? "var(--am-text)" : "var(--am-text-muted)",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: 99,
            background: hasPending ? "var(--am-irid)" : "var(--am-chip-strong)",
          }}
        />
        <span style={{ fontWeight: hasPending ? 600 : 500 }}>
          {pendingCount === 0
            ? "No pending swaps"
            : `${pendingCount} pending swap${pendingCount === 1 ? "" : "s"}`}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={!hasPending || busy}
          onClick={onReset}
          style={{
            ...buttonBase,
            background: "transparent",
            color: hasPending ? "var(--am-text-muted)" : "var(--am-text-faint)",
            opacity: hasPending && !busy ? 1 : 0.5,
            cursor: hasPending && !busy ? "pointer" : "not-allowed",
          }}
        >
          Reset
        </button>
        <button
          type="button"
          disabled={!hasPending || busy}
          onClick={onSave}
          style={{
            ...buttonBase,
            background: "var(--am-irid)",
            color: "#fff",
            border: "1px solid var(--am-border-strong)",
            opacity: hasPending && !busy ? 1 : 0.5,
            cursor: hasPending && !busy ? "pointer" : "not-allowed",
            boxShadow: hasPending && !busy ? "0 8px 22px rgba(74,140,255,0.35)" : undefined,
          }}
        >
          {busy ? "Saving…" : "Save Lineup"}
        </button>
      </div>
    </div>
  );
}
