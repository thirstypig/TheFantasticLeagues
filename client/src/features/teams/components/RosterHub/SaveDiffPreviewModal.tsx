// client/src/features/teams/components/RosterHub/SaveDiffPreviewModal.tsx
//
// Confirm-before-save modal for the complex-batch scenario per
// direction-lock Complex-#3 ("≥3 changes: confirm modal with diff
// preview"). Shows an ordered list of every queued change with a
// kind-specific diff line and inline per-row server-side validation
// error banners (Complex-#6).
//
// Triggered ONLY when the queue holds ≥3 changes. ≤2 changes save
// directly via the bar's "Save" button — the threshold balances
// friction (no extra click for small edits) vs. accidental-destructive
// risk (a 4-step batch deserves a sanity check).
//
// Atomic semantics (Complex-#4): the modal renders any
// `PendingChangeBatchError` failures inline and lets the user revert
// the offending change(s) or retry. The save itself stays all-or-
// nothing — partial commits never reach the UI.

import type { PendingChange } from "../../hooks/usePendingChanges";
import type { PendingChangeFailure } from "../../hooks/usePendingChanges";

export interface DiffRow {
  id: string;
  kind: PendingChange["kind"];
  /** Primary line — "DROP Marcus Semien", "FA ADD Jarren Duran ($18 proj) — drops Brandon Lockridge". */
  text: string;
  /** Optional second line for chained-change context — "↳ depends on Drop #1". */
  dependsOn?: string;
}

const BADGE_LABELS: Record<PendingChange["kind"], string> = {
  swap: "SWAP",
  fa_add: "FA ADD",
  il_stash: "IL STASH",
  il_activate: "IL ACTIVATE",
};

const BADGE_TONES: Record<PendingChange["kind"], { fg: string; mix: number }> = {
  swap: { fg: "#22d3ee", mix: 22 },
  fa_add: { fg: "#22c55e", mix: 22 },
  il_stash: { fg: "#f59e0b", mix: 22 },
  il_activate: { fg: "#22d3ee", mix: 22 },
};

interface SaveDiffPreviewModalProps {
  /** Whether the modal is currently open. Caller controls. */
  open: boolean;
  /** Ordered diff rows — one per queued change. */
  rows: ReadonlyArray<DiffRow>;
  /**
   * Per-change failures from the most recent save attempt — keyed by
   * `changeId`. Empty array on first open. When non-empty the matching
   * row renders an inline red banner with the failure reason
   * (Complex-#6: server-side validation, inline per row).
   */
  failures?: ReadonlyArray<PendingChangeFailure>;
  /** True while the save mutation is in flight. Disables both buttons. */
  saving?: boolean;
  /** Confirm + start the save. */
  onConfirm: () => void;
  /** Cancel — close the modal without saving. */
  onCancel: () => void;
  /**
   * Optional per-row revert affordance shown when a failure exists.
   * Lets users drop the offending change in place rather than
   * cancelling the whole modal. Per Complex-#2 the consumer should
   * route this through `usePendingChanges.revertChange()` so any
   * cascade-revert fires automatically.
   */
  onRevertItem?: (id: string) => void;
}

export function SaveDiffPreviewModal({
  open,
  rows,
  failures = [],
  saving = false,
  onConfirm,
  onCancel,
  onRevertItem,
}: SaveDiffPreviewModalProps) {
  if (!open) return null;

  const failuresByChangeId = new Map<string, PendingChangeFailure>();
  for (const f of failures) failuresByChangeId.set(f.changeId, f);
  const hasFailures = failures.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-diff-preview-title"
      data-testid="save-diff-preview-modal"
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
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div
        style={{
          background: "var(--am-surface-strong)",
          border: "1px solid var(--am-border-strong)",
          borderRadius: 18,
          padding: 24,
          maxWidth: 560,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          color: "var(--am-text)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <h2
            id="save-diff-preview-title"
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              fontFamily: "var(--am-display)",
            }}
          >
            Save {rows.length} change{rows.length === 1 ? "" : "s"}?
          </h2>
        </div>
        <p style={{ margin: "4px 0 16px 0", fontSize: 12.5, color: "var(--am-text-muted)" }}>
          Review the batch before committing. All changes save atomically — if any single
          mutation fails, the whole batch rolls back.
        </p>

        {hasFailures && (
          <div
            role="alert"
            data-testid="save-diff-preview-error-banner"
            style={{
              padding: "10px 14px",
              marginBottom: 12,
              background: "color-mix(in srgb, #c41a85 14%, transparent)",
              border: "1px solid #c41a85",
              borderRadius: 12,
              fontSize: 12.5,
            }}
          >
            <strong>Save failed</strong> — {failures.length} change{failures.length === 1 ? "" : "s"} need
            attention. Fix or revert the highlighted rows below, then retry.
          </div>
        )}

        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {rows.map((r, i) => {
            const tone = BADGE_TONES[r.kind];
            const failure = failuresByChangeId.get(r.id);
            return (
              <li
                key={r.id}
                data-testid="save-diff-preview-row"
                data-kind={r.kind}
                data-failed={failure ? "true" : "false"}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: "10px 12px",
                  border: failure
                    ? "1px solid #c41a85"
                    : "1px solid var(--am-border)",
                  borderRadius: 12,
                  background: failure
                    ? "color-mix(in srgb, #c41a85 8%, var(--am-card))"
                    : "var(--am-card)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 99,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--am-chip)",
                      border: "1px solid var(--am-border)",
                      fontSize: 10,
                      color: "var(--am-text-muted)",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    aria-label={BADGE_LABELS[r.kind]}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 6,
                      background: `color-mix(in srgb, ${tone.fg} ${tone.mix}%, transparent)`,
                      color: tone.fg,
                      letterSpacing: 0.4,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {BADGE_LABELS[r.kind]}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0 }}>{r.text}</span>
                  {failure && onRevertItem && (
                    <button
                      type="button"
                      onClick={() => onRevertItem(r.id)}
                      data-testid="save-diff-preview-revert"
                      disabled={saving}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--am-border)",
                        background: "transparent",
                        color: "var(--am-text-muted)",
                        cursor: saving ? "not-allowed" : "pointer",
                        opacity: saving ? 0.5 : 1,
                        flexShrink: 0,
                      }}
                    >
                      Revert
                    </button>
                  )}
                </div>
                {r.dependsOn && (
                  <span
                    style={{
                      display: "block",
                      fontSize: 11,
                      color: "var(--am-text-muted)",
                      marginTop: 4,
                      paddingLeft: 36,
                    }}
                  >
                    ↳ depends on {r.dependsOn}
                  </span>
                )}
                {failure && (
                  <span
                    role="alert"
                    data-testid="save-diff-preview-row-error"
                    style={{
                      display: "block",
                      fontSize: 11.5,
                      color: "#fca5a5",
                      marginTop: 6,
                      paddingLeft: 36,
                    }}
                  >
                    {failure.reason}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 18,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid var(--am-border)",
              background: "transparent",
              color: "var(--am-text-muted)",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.5 : 1,
              minHeight: 40,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="save-diff-preview-confirm"
            onClick={onConfirm}
            disabled={saving}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "10px 22px",
              borderRadius: 10,
              border: "1px solid transparent",
              // Cyan gradient per Complex-#3 spec.
              background: "linear-gradient(135deg, #22d3ee 0%, #0ea5e9 100%)",
              color: "#fff",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
              minHeight: 40,
              boxShadow: "0 8px 22px rgba(34, 211, 238, 0.25)",
            }}
          >
            {saving ? "Saving…" : hasFailures ? "Retry save" : "Confirm save"}
          </button>
        </div>
      </div>
    </div>
  );
}
