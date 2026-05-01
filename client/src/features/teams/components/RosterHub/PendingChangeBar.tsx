// client/src/features/teams/components/RosterHub/PendingChangeBar.tsx
//
// Top-of-table action bar shown whenever there are pending changes
// in the queue. Disappears at zero. Mirrors the Hub-scenario contract
// in `docs/plans/2026-04-30-roster-hub-direction-lock.md`:
//   - Left: cyan dot (#22d3ee per direction-lock #7) + count summary
//   - Right: Revert all + Save buttons; both disable while saving
//   - Below the row: optional inline error banner with retry affordance
//
// Per-row revert is rendered inline on each RosterRowV3 (not in this bar).
// The component renders nothing when `count === 0` AND there is no error
// to surface — keeps the chrome out of the way on a clean roster.

interface PendingChangeBarProps {
  count: number;
  onRevertAll: () => void;
  onSave: () => void;
  /** When true, both buttons are disabled and Save shows a saving label. */
  saving?: boolean;
  /** Inline error message; rendered as a separate row beneath the bar. */
  saveError?: string | null;
  /** Retry handler — typically the same fn as onSave, plumbed through for clarity. */
  onRetry?: () => void;
  /** Dismiss the error without retrying. */
  onDismissError?: () => void;
}

export function PendingChangeBar({
  count,
  onRevertAll,
  onSave,
  saving = false,
  saveError = null,
  onRetry,
  onDismissError,
}: PendingChangeBarProps) {
  if (count <= 0 && !saveError) return null;
  const noun = count === 1 ? "change" : "changes";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
      {count > 0 && (
        <div
          role="region"
          aria-label="Pending roster changes"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 14px",
            // Cyan tinted background per direction-lock #7 — distinct
            // from IL-amber and the in-season warning yellow.
            background: "color-mix(in srgb, #22d3ee 8%, transparent)",
            border: "1px solid var(--am-border-strong)",
            borderRadius: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 99,
                // Cyan dot per direction-lock #7. Replaces the prior
                // iridescent gradient — cyan is reserved for "pending"
                // semantics across the v3 hub.
                background: "#22d3ee",
                boxShadow: "0 0 8px rgba(34, 211, 238, 0.55)",
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>
              {count} pending {noun}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onRevertAll}
              disabled={saving}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid var(--am-border)",
                background: "transparent",
                color: "var(--am-text-muted)",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.5 : 1,
                minHeight: 36,
              }}
            >
              Revert all
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "8px 16px",
                borderRadius: 10,
                border: "1px solid transparent",
                background: "var(--am-irid)",
                color: "#fff",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
                minHeight: 36,
                boxShadow: "0 8px 22px rgba(214, 43, 155, 0.18)",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 14px",
            background: "color-mix(in srgb, #c41a85 12%, transparent)",
            border: "1px solid #c41a85",
            borderRadius: 14,
            color: "var(--am-text)",
            fontSize: 12.5,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span aria-hidden style={{ fontWeight: 700 }}>!</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{saveError}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={saving}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--am-border-strong)",
                  background: "var(--am-chip-strong)",
                  color: "var(--am-text)",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.5 : 1,
                  minHeight: 28,
                }}
              >
                Retry
              </button>
            )}
            {onDismissError && (
              <button
                type="button"
                onClick={onDismissError}
                aria-label="Dismiss error"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid transparent",
                  background: "transparent",
                  color: "var(--am-text-muted)",
                  cursor: "pointer",
                  minHeight: 28,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
