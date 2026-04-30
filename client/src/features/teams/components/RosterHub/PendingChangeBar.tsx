// client/src/features/teams/components/RosterHub/PendingChangeBar.tsx
//
// Top-of-table action bar shown whenever there are pending changes
// in the queue. Disappears at zero. Mirrors the §0 spec:
//   - Left: count summary ("3 pending changes")
//   - Right: Revert all + Save buttons
//
// Visually consistent with the SwapMode preview's `SwapActionBar` so
// the two design directions look comparable.

interface PendingChangeBarProps {
  count: number;
  onRevertAll: () => void;
  onSave: () => void;
}

export function PendingChangeBar({ count, onRevertAll, onSave }: PendingChangeBarProps) {
  if (count <= 0) return null;
  const noun = count === 1 ? "change" : "changes";
  return (
    <div
      role="region"
      aria-label="Pending roster changes"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 14px",
        background: "color-mix(in srgb, #2f6df0 8%, transparent)",
        border: "1px solid var(--am-border-strong)",
        borderRadius: 14,
        marginBottom: 12,
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
            background: "linear-gradient(135deg, #00b894, #d62b9b)",
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
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 14px",
            borderRadius: 10,
            border: "1px solid var(--am-border)",
            background: "transparent",
            color: "var(--am-text-muted)",
            cursor: "pointer",
            minHeight: 36,
          }}
        >
          Revert all
        </button>
        <button
          type="button"
          onClick={onSave}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 10,
            border: "1px solid transparent",
            background: "var(--am-irid)",
            color: "#fff",
            cursor: "pointer",
            minHeight: 36,
            boxShadow: "0 8px 22px rgba(214, 43, 155, 0.18)",
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
