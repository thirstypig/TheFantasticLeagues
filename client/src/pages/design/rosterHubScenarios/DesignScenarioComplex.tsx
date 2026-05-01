// client/src/pages/design/rosterHubScenarios/DesignScenarioComplex.tsx
//
// Scenario 4 — "Complex transaction batch" (stretch).
//
// User assembles a multi-step batch:
//   1. Drop player A
//   2. IL-stash player B
//   3. Add FA player C
//   4. Swap positions of D and E
//
// All accumulated in a labeled pending-changes panel ordered by
// timestamp with per-item revert. Save commits the whole sequence;
// "Revert all" reverses everything.
//
// To keep the preview focused, this scenario is mostly read-only —
// pre-canned changes are loaded by default with mock controls to
// add/remove changes one at a time. The drag interactions live in
// the Hub / FA / IL scenarios; this scenario's job is to spec the
// pending-changes LIST shape.

import { useReducer, useState } from "react";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { PendingChangeBar } from "../../../features/teams/components/RosterHub";
import { Toast } from "./shared";

type ChangeKind = "drop" | "il-stash" | "fa-add" | "swap";

interface ComplexChange {
  id: string;
  kind: ChangeKind;
  /** Display-only label of moving player. */
  primaryName: string;
  /** Display-only secondary entity (target slot for swap, FA name etc). */
  secondary?: string;
  /** Order index — drives the ordered display. */
  ts: number;
}

const SEED: ComplexChange[] = [
  { id: "1", kind: "swap", primaryName: "Mookie Betts", secondary: "Aaron Judge", ts: 1 },
  { id: "2", kind: "il-stash", primaryName: "Trea Turner", secondary: "Injured 10-Day", ts: 2 },
  { id: "3", kind: "drop", primaryName: "Marcus Semien", ts: 3 },
  { id: "4", kind: "fa-add", primaryName: "Jarren Duran", secondary: "OF · BOS · $18 proj", ts: 4 },
];

type Action =
  | { type: "remove"; id: string }
  | { type: "reset" }
  | { type: "add"; change: Omit<ComplexChange, "ts" | "id"> & { id?: string } };

function reduce(state: ComplexChange[], action: Action): ComplexChange[] {
  switch (action.type) {
    case "remove":
      return state.filter((c) => c.id !== action.id);
    case "reset":
      return SEED.map((c) => ({ ...c }));
    case "add": {
      const nextTs = state.length === 0 ? 1 : Math.max(...state.map((c) => c.ts)) + 1;
      return [
        ...state,
        {
          id: action.change.id ?? `new-${nextTs}`,
          kind: action.change.kind,
          primaryName: action.change.primaryName,
          secondary: action.change.secondary,
          ts: nextTs,
        },
      ];
    }
  }
}

export function DesignScenarioComplex() {
  const [changes, dispatch] = useReducer(reduce, undefined, () => SEED.map((c) => ({ ...c })));
  const [toast, setToast] = useState<string | null>(null);

  const sortedChanges = [...changes].sort((a, b) => a.ts - b.ts);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  return (
    <>
      <Glass padded={false} style={{ overflow: "visible" }}>
        <div style={{ padding: 16, paddingBottom: 6 }}>
          <SectionLabel>✦ Complex batch · multi-step pending changes</SectionLabel>
          <p style={{ margin: 0, fontSize: 12, color: "var(--am-text-muted)" }}>
            One pending-changes panel that captures every kind of mutation in chronological
            order: drops, IL stashes, FA adds, slot swaps. Per-item revert removes a single
            change without touching the rest. Save commits the entire ordered batch.
          </p>
        </div>

        <div style={{ padding: "8px 16px 16px" }}>
          <PendingChangeBar
            count={changes.length}
            onRevertAll={() => {
              dispatch({ type: "reset" });
              showToast("Reset to seeded batch");
            }}
            onSave={() => {
              showToast(`(Mock) Saved ${changes.length} change${changes.length === 1 ? "" : "s"}`);
            }}
          />

          <div style={{ marginTop: 6 }}>
            {sortedChanges.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  fontSize: 13,
                  color: "var(--am-text-muted)",
                  border: "1px dashed var(--am-border)",
                  borderRadius: 12,
                }}
              >
                No pending changes. Reset to load the canned batch.
              </div>
            ) : (
              sortedChanges.map((c, i) => (
                <ChangeRow
                  key={c.id}
                  change={c}
                  index={i + 1}
                  onRemove={() => {
                    dispatch({ type: "remove", id: c.id });
                    showToast(`Reverted: ${c.primaryName}`);
                  }}
                />
              ))
            )}
          </div>
        </div>
      </Glass>

      <ComplexFooter
        onAddSwap={() =>
          dispatch({
            type: "add",
            change: { kind: "swap", primaryName: "Bobby Witt Jr.", secondary: "Pete Alonso" },
          })
        }
        onAddDrop={() => dispatch({ type: "add", change: { kind: "drop", primaryName: "Edwin Díaz" } })}
        onAddFA={() =>
          dispatch({
            type: "add",
            change: { kind: "fa-add", primaryName: "Devin Williams", secondary: "RP · NYY · $13 proj" },
          })
        }
        onReset={() => {
          dispatch({ type: "reset" });
          showToast("Restored canned batch");
        }}
      />

      {toast && <Toast message={toast} />}
    </>
  );
}

/* ─── Change row ────────────────────────────────────────────────── */

function ChangeRow({
  change,
  index,
  onRemove,
}: {
  change: ComplexChange;
  index: number;
  onRemove: () => void;
}) {
  const meta = KIND_META[change.kind];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderBottom: "1px solid var(--am-border)",
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 99,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--am-chip)",
          border: "1px solid var(--am-border)",
          fontSize: 11,
          color: "var(--am-text-muted)",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {index}
      </span>
      <Tag tone={meta.tone}>{meta.label}</Tag>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>
          {change.primaryName}
        </span>
        {change.secondary && (
          <>
            <span style={{ color: "var(--am-text-faint)", margin: "0 6px" }}>·</span>
            <span style={{ fontSize: 12, color: "var(--am-text-muted)" }}>{change.secondary}</span>
          </>
        )}
      </div>
      <button type="button" onClick={onRemove} style={revertBtn} title="Revert this change">
        ↩ Revert
      </button>
    </div>
  );
}

const KIND_META: Record<ChangeKind, { label: string; tone: "drop" | "il" | "fa" | "swap" }> = {
  drop: { label: "Drop", tone: "drop" },
  "il-stash": { label: "IL stash", tone: "il" },
  "fa-add": { label: "FA add", tone: "fa" },
  swap: { label: "Swap", tone: "swap" },
};

function Tag({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "drop" | "il" | "fa" | "swap";
}) {
  const palette =
    tone === "drop"
      ? { bg: "color-mix(in srgb, #ef4444 14%, transparent)", color: "#fca5a5", border: "rgba(239,68,68,0.4)" }
      : tone === "il"
        ? { bg: "color-mix(in srgb, #ef4444 14%, transparent)", color: "#fca5a5", border: "rgba(239,68,68,0.4)" }
        : tone === "fa"
          ? { bg: "color-mix(in srgb, #22c55e 14%, transparent)", color: "#86efac", border: "rgba(34,197,94,0.4)" }
          : { bg: "color-mix(in srgb, #2f6df0 14%, transparent)", color: "#93c5fd", border: "rgba(74,140,255,0.4)" };
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 99,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        background: palette.bg,
        color: palette.color,
        border: `1px solid ${palette.border}`,
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

const revertBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--am-border)",
  borderRadius: 8,
  padding: "4px 10px",
  fontSize: 11.5,
  color: "var(--am-text-muted)",
  cursor: "pointer",
  flexShrink: 0,
};

/* ─── Footer ────────────────────────────────────────────────────── */

function ComplexFooter({
  onAddSwap,
  onAddDrop,
  onAddFA,
  onReset,
}: {
  onAddSwap: () => void;
  onAddDrop: () => void;
  onAddFA: () => void;
  onReset: () => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
      <Glass>
        <SectionLabel>✦ Mock controls</SectionLabel>
        <p style={{ fontSize: 12, color: "var(--am-text-muted)", marginTop: 6, marginBottom: 10 }}>
          Build the batch incrementally without dragging.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" onClick={onAddSwap} style={ctlButton}>+ Add a swap change</button>
          <button type="button" onClick={onAddDrop} style={ctlButton}>+ Add a drop change</button>
          <button type="button" onClick={onAddFA} style={ctlButton}>+ Add an FA add change</button>
          <button type="button" onClick={onReset} style={{ ...ctlButton, borderColor: "rgba(239,68,68,0.45)", color: "#fca5a5" }}>
            Reset to canned batch
          </button>
        </div>
      </Glass>
      <Glass>
        <SectionLabel>✦ Open questions — Complex batch</SectionLabel>
        <ol style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 12.5, color: "var(--am-text)", lineHeight: 1.6 }}>
          <li><strong>Batch ordering</strong> — current is by timestamp; should the user be able to reorder? Drag-handle on the change row?</li>
          <li><strong>Partial revert UX</strong> — current is per-item; what about "revert this and everything after" (chained dependencies)?</li>
          <li><strong>Save confirm</strong> — explicit "Save" button only, or a confirm modal with diff preview when ≥3 changes?</li>
          <li><strong>Conflict on save</strong> — if step 2 fails, do we roll back steps 1+3+4 or leave partial state? Atomic vs. best-effort.</li>
          <li><strong>Persistence across navigation</strong> — keep batch in localStorage when user navigates away mid-build?</li>
          <li><strong>Cross-team validation</strong> — FA adds need to verify the player is still a FA at save time; drops need to verify roster size doesn't go negative.</li>
          <li><strong>Mobile rendering</strong> — current row layout is dense; should mobile show condensed view with "tap to expand"?</li>
        </ol>
      </Glass>
    </div>
  );
}

const ctlButton: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid var(--am-border)",
  background: "var(--am-chip)",
  color: "var(--am-text)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "left",
};
