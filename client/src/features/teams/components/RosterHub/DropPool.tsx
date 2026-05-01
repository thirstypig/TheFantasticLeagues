// client/src/features/teams/components/RosterHub/DropPool.tsx
//
// "Drop pool · N players" surface for the FA scenario
// (docs/plans/2026-04-30-roster-hub-direction-lock.md FA-#5).
//
// Renders the displaced roster players queued by `fa_add` pending
// changes. Mounted between the active roster and the IL section. Each
// row exposes a "Restore" button that bubbles back to the parent so it
// can drop the matching `fa_add` change from the queue (which puts the
// displaced player back on the bench).
//
// Hidden when there are zero displaced players — keeps the chrome out
// of the way on a clean roster.

interface DisplacedRow {
  /** PendingChange id — the fa_add this displaced row belongs to. */
  changeId: string;
  rosterId: number;
  playerId: number;
  name: string;
  /** "FA add: Mookie Betts" — used when the change row also wants to
   *  echo the FA being added. Optional: the panel falls back to "Drop"
   *  when omitted. */
  faName?: string;
  slot: string;
}

interface DropPoolProps {
  rows: ReadonlyArray<DisplacedRow>;
  /** Bubble back to drop the matching fa_add change from the queue. */
  onRestore: (changeId: string) => void;
}

export function DropPool({ rows, onRestore }: DropPoolProps) {
  if (rows.length === 0) return null;
  const noun = rows.length === 1 ? "player" : "players";
  return (
    <section
      role="region"
      aria-label="Drop pool"
      style={{
        background: "color-mix(in srgb, #c41a85 6%, transparent)",
        border: "1px solid var(--am-border)",
        borderRadius: 14,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        margin: "12px 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: 99,
            background: "#ff6b8a",
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--am-text)" }}>
          Drop pool · {rows.length} {noun}
        </span>
      </div>
      <ul
        role="list"
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {rows.map((r) => (
          <li
            key={r.changeId}
            data-testid="drop-pool-row"
            data-change-id={r.changeId}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 8,
              background: "var(--am-chip)",
            }}
          >
            <span
              aria-label="Drop"
              title="Will be dropped on save"
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 6,
                background: "color-mix(in srgb, #ff6b8a 24%, transparent)",
                color: "#ff6b8a",
                letterSpacing: 0.4,
              }}
            >
              DROP
            </span>
            <span style={{ fontSize: 12, color: "var(--am-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <strong>{r.name}</strong>
              <span style={{ color: "var(--am-text-muted)", marginLeft: 6 }}>
                from {r.slot}
                {r.faName ? ` · for ${r.faName}` : ""}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onRestore(r.changeId)}
              aria-label={`Restore ${r.name} to roster`}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 8,
                border: "1px solid var(--am-border)",
                background: "transparent",
                color: "var(--am-text-muted)",
                cursor: "pointer",
                minHeight: 26,
              }}
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
