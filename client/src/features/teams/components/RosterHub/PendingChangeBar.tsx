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
// IL scenario extension (this PR): two more badge variants — IL STASH
// (amber) and IL ACTIVATE (cyan). Optional `secondary` line per row
// renders explicit auto-resolve text for ≥3-player cascades per
// direction-lock IL #5.
//
// Complex-batch scenario extension (this PR):
//   - `dependsOn` per item — the human-readable label of the parent
//     change (e.g. "Drop #1") rendered as a subtle "↳ depends on …"
//     badge under the row text. Per direction-lock Complex-#2,
//     dependency-aware revert is owned by `usePendingChanges`; this
//     bar's job is just to surface the relationship.
//   - Mobile condensed view at <768px — rows render badge + name only,
//     details (slot, secondary line) revealed on tap-to-expand. Per
//     direction-lock Complex-#7. CSS-only via media query so SSR-safe.
//   - Per-row failure banner — when the most recent save attempt
//     surfaced a `PendingChangeBatchError`, the offending row paints
//     a red border + inline error reason. Mirrors the modal's render
//     so the bar is informative even without re-opening the modal.
//
// The component renders nothing when `count === 0` AND there is no error
// to surface — keeps the chrome out of the way on a clean roster.

import { useState } from "react";
import "./rosterHub.css";

export type PendingChangeBarItemKind = "swap" | "fa_add" | "il_stash" | "il_activate";

export interface PendingChangeBarItem {
  id: string;
  kind: PendingChangeBarItemKind;
  /** Human-readable summary, e.g. "Mookie Betts → 2B" or
   *  "Add Trout · drop Stanton". Caller decides phrasing. */
  text: string;
  /** Optional second-line explicit cascade text — IL scenario direction-lock #5
   *  surfaces this for ≥3-player auto-resolve cascades. Rendered as a smaller
   *  muted line beneath `text`. */
  secondary?: string;
  /** Optional dependency badge — rendered as "↳ depends on Drop #1" under
   *  the row when set. Set by the caller from the dependency graph
   *  computed by `usePendingChanges` per direction-lock Complex-#2. */
  dependsOn?: string;
  /** Optional inline failure reason — "Player no longer FA — cancel this
   *  change". When set, the row paints red. Per Complex-#6. */
  errorReason?: string;
}

const BADGE_LABELS: Record<PendingChangeBarItemKind, string> = {
  swap: "SWAP",
  fa_add: "FA ADD",
  il_stash: "IL STASH",
  il_activate: "IL ACTIVATE",
};

const BADGE_TONES: Record<PendingChangeBarItemKind, { fg: string; mix: number }> = {
  // Cyan = "pending swap" (matches direction-lock #7 dot).
  swap: { fg: "#22d3ee", mix: 22 },
  // Green = additive (FA add).
  fa_add: { fg: "#22c55e", mix: 22 },
  // Amber = IL semantics (mirrors IL section red/amber palette).
  il_stash: { fg: "#f59e0b", mix: 22 },
  // Cyan = activation back to active roster.
  il_activate: { fg: "#22d3ee", mix: 22 },
};

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
            <PendingChangeRow
              key={it.id}
              item={it}
              saving={saving}
              onRevertItem={onRevertItem}
            />
          ))}
        </ul>
      )}

      {/* Save error banner — see below for the full row. */}
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

/**
 * Per-row renderer for the pending-changes list. Owns its own
 * tap-to-expand state for the mobile condensed view (Complex-#7).
 *
 * Layout:
 *   - Always-visible summary row: badge + name + revert button
 *   - Below 768px: tap to toggle the body (secondary, dependsOn,
 *     errorReason)
 *   - 768px+: body always visible (CSS forces `display: block`)
 *
 * Responsiveness is CSS-driven — no JS resize listeners — so the
 * server can render the same markup the client hydrates without
 * a layout flicker on narrow viewports.
 */
function PendingChangeRow({
  item,
  saving = false,
  onRevertItem,
}: {
  item: PendingChangeBarItem;
  saving: boolean;
  onRevertItem?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tone = BADGE_TONES[item.kind];
  const failed = !!item.errorReason;
  const hasBody = !!item.secondary || !!item.errorReason;

  return (
    <li
      data-testid="pending-change-row"
      data-kind={item.kind}
      data-failed={failed ? "true" : "false"}
      data-expanded={expanded ? "true" : "false"}
      className={`am-pending-row-mobile ${failed ? "am-pending-row-failed" : ""}`}
      style={{ listStyle: "none" }}
    >
      <summary
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          if (hasBody) setExpanded((v) => !v);
        }}
      >
        <span
          aria-label={BADGE_LABELS[item.kind]}
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: 6,
            background: `color-mix(in srgb, ${tone.fg} ${tone.mix}%, transparent)`,
            color: tone.fg,
            letterSpacing: 0.4,
            whiteSpace: "nowrap",
          }}
        >
          {BADGE_LABELS[item.kind]}
        </span>
        <span style={{ minWidth: 0, overflow: "hidden" }}>
          <span
            style={{
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 12,
              color: "var(--am-text)",
            }}
          >
            {item.text}
            {item.dependsOn && (
              <span
                className="am-pending-row-dependson"
                data-testid="pending-change-dependson"
                title={`Depends on ${item.dependsOn}`}
              >
                ↳ depends on {item.dependsOn}
              </span>
            )}
          </span>
        </span>
        {onRevertItem && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRevertItem(item.id);
            }}
            aria-label={`Revert ${item.text}`}
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
      </summary>
      {hasBody && (
        <div
          className="am-pending-row-body"
          style={{ display: expanded ? "block" : undefined }}
          data-mobile-hidden={!expanded ? "true" : "false"}
        >
          {item.secondary && (
            <span className="am-pending-row-meta" data-testid="pending-change-secondary">
              {item.secondary}
            </span>
          )}
          {item.errorReason && (
            <span
              role="alert"
              className="am-pending-row-error"
              data-testid="pending-change-error"
            >
              {item.errorReason}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
