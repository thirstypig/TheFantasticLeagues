// client/src/features/teams/components/RosterHub/PendingChangeBar.tsx
//
// Top-of-table action bar shown whenever there are pending changes
// in the queue. Disappears at zero. Mirrors the Hub-scenario contract
// in `docs/plans/2026-04-30-roster-hub-direction-lock.md`:
//   - Left: cyan dot (#22d3ee per direction-lock #7) + count summary
//   - Right: Revert all + Save buttons; both disable while saving
//   - Below the row: optional inline error banner with retry affordance
//
// FA scenario extension (FA-#3): when callers pass `items`, the bar
// expands to render one row per pending change with a kind-specific
// badge — SWAP (cyan) for swaps, FA ADD (green) for fa_add. Per-item
// revert lives on each row. Callers that don't pass items keep the
// count-only Hub UX.
//
// The component renders nothing when `count === 0` AND there is no error
// to surface — keeps the chrome out of the way on a clean roster.

export interface PendingChangeBarItem {
  id: string;
  kind: "swap" | "fa_add";
  /** Human-readable summary, e.g. "Mookie Betts → 2B" or
   *  "Add Trout · drop Stanton". Caller decides phrasing. */
  text: string;
}

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
  /** Optional per-change rows (FA scenario). When present, the bar
   *  expands beneath the count row with one li per item + its badge +
   *  per-item Revert. Omit on the Hub-only call site to preserve the
   *  count-only chrome. */
  items?: ReadonlyArray<PendingChangeBarItem>;
  /** Per-item revert handler. Required when `items` is non-empty. */
  onRevertItem?: (id: string) => void;
}

export function PendingChangeBar({
  count,
  onRevertAll,
  onSave,
  saving = false,
  saveError = null,
  onRetry,
  onDismissError,
  items,
  onRevertItem,
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

      {items && items.length > 0 && (
        <ul
          role="list"
          aria-label="Pending change list"
          style={{
            listStyle: "none",
            padding: "8px 10px",
            margin: 0,
            background: "var(--am-card)",
            border: "1px solid var(--am-border)",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {items.map((it) => (
            <li
              key={it.id}
              data-testid="pending-change-row"
              data-kind={it.kind}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                alignItems: "center",
                gap: 8,
                padding: "5px 4px",
                fontSize: 12,
                color: "var(--am-text)",
              }}
            >
              <span
                aria-label={it.kind === "swap" ? "Swap" : "Free agent add"}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 6,
                  background:
                    it.kind === "fa_add"
                      ? "color-mix(in srgb, #22c55e 22%, transparent)"
                      : "color-mix(in srgb, #22d3ee 22%, transparent)",
                  color: it.kind === "fa_add" ? "#22c55e" : "#22d3ee",
                  letterSpacing: 0.4,
                }}
              >
                {it.kind === "fa_add" ? "FA ADD" : "SWAP"}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.text}
              </span>
              {onRevertItem && (
                <button
                  type="button"
                  onClick={() => onRevertItem(it.id)}
                  aria-label={`Revert ${it.text}`}
                  disabled={saving}
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 6,
                    border: "1px solid transparent",
                    background: "transparent",
                    color: "var(--am-text-muted)",
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.5 : 1,
                    minHeight: 22,
                  }}
                >
                  Undo
                </button>
              )}
            </li>
          ))}
        </ul>
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
