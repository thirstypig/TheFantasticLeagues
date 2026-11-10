// The one overlay the app allows: a confirm sheet shown right before an
// irreversible action. Bottom-anchored on phones (< 768px), centered on desktop.
// Esc and a scrim click cancel; `busy` locks every way out and in.
import React, { useEffect, useRef } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";

export interface ConfirmSheetProps {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const BUTTON: React.CSSProperties = {
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 6,
  fontSize: 17,
  fontWeight: 600,
  cursor: "pointer",
};

export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps): JSX.Element | null {
  const desktop = useMediaQuery("(min-width: 768px)");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = React.useId();

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      data-testid="confirm-sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: desktop ? "center" : "flex-end",
        justifyContent: "center",
        background: "var(--am-scrim, rgba(0, 0, 0, 0.45))",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          width: "100%",
          maxWidth: desktop ? 440 : "none",
          background: "var(--am-surface)",
          color: "var(--am-text)",
          border: "1px solid var(--am-border)",
          borderRadius: desktop ? 8 : "12px 12px 0 0",
          padding: "20px 16px calc(16px + env(safe-area-inset-bottom, 0px))",
          boxSizing: "border-box",
        }}
      >
        <h2 id={titleId} style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700 }}>{title}</h2>
        <p style={{ margin: "0 0 20px", fontSize: 17, color: "var(--am-text-muted)" }}>{body}</p>
        <div style={{ display: "flex", flexDirection: desktop ? "row-reverse" : "column", gap: 8 }}>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={() => {
              if (!busy) onConfirm();
            }}
            style={{
              ...BUTTON,
              flex: 1,
              border: "1px solid var(--am-accent)",
              background: "var(--am-accent)",
              color: "var(--am-on-accent)",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!busy) onCancel();
            }}
            style={{
              ...BUTTON,
              flex: 1,
              border: "1px solid var(--am-border-strong)",
              background: "transparent",
              color: "var(--am-text)",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmSheet;
