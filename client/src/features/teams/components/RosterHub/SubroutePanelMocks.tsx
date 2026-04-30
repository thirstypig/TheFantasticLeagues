// client/src/features/teams/components/RosterHub/SubroutePanelMocks.tsx
//
// Visual stand-ins for the existing AddDropPanel / PlaceOnIlPanel /
// ActivateFromIlPanel components, so the v3 preview can demonstrate
// the inline sub-route layout without re-rendering the real (data-bound)
// panels. PR2 will swap these for real component imports — the API is
// unchanged from those components' perspective; only the mount surface
// (sub-route instead of modal) is new.
//
// All three are stateless form-shape mocks. Keep them simple — the
// goal is to show "this is roughly what the panel will look like in
// the page-flow position", not to fake real interaction.

import type { ReactNode } from "react";

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 11,
        color: "var(--am-text-muted)",
        textTransform: "uppercase",
        letterSpacing: 0.6,
        fontWeight: 600,
      }}
    >
      <span>{label}</span>
      {children}
    </label>
  );
}

function MockInput({ placeholder }: { placeholder: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid var(--am-border)",
        background: "var(--am-surface-faint)",
        color: "var(--am-text-faint)",
        fontSize: 12.5,
        fontWeight: 500,
        textTransform: "none",
        letterSpacing: 0,
      }}
    >
      {placeholder}
    </div>
  );
}

function MockSelect({ options }: { options: string[] }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid var(--am-border)",
        background: "var(--am-chip)",
        color: "var(--am-text)",
        fontSize: 12.5,
        fontWeight: 500,
        textTransform: "none",
        letterSpacing: 0,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>{options[0]}</span>
      <span aria-hidden style={{ color: "var(--am-text-faint)" }}>
        ▾
      </span>
    </div>
  );
}

function MockButton({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <div
      style={{
        padding: "10px 16px",
        borderRadius: 12,
        background: primary ? "var(--am-irid)" : "transparent",
        color: primary ? "#fff" : "var(--am-text-muted)",
        border: primary ? "1px solid transparent" : "1px solid var(--am-border)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "default",
        minHeight: 36,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {label}
    </div>
  );
}

/**
 * Mock for `AddDropPanel`. PR2 wires the real component, including the
 * pre-selected slot from the row's pill (passed as `?slot=OF` in the
 * sub-route URL).
 */
export function AddDropPanelMock({ preselectedSlot }: { preselectedSlot?: string }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <FieldRow label="Free agent to add">
        <MockInput placeholder="Search MLB free agents…" />
      </FieldRow>
      <FieldRow label="Slot to fill">
        <MockSelect options={[preselectedSlot ?? "OF (auto)", "1B", "2B", "OF", "DH", "P"]} />
      </FieldRow>
      <FieldRow label="Player to drop">
        <MockSelect options={["Choose from your roster…"]} />
      </FieldRow>
      <div style={{ fontSize: 11, color: "var(--am-text-faint)", lineHeight: 1.5, marginTop: 4 }}>
        Auto-resolve will compute legal slot assignments. If a Position-Eligibility shift is
        required, you'll see the proposed end-state before confirming.
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <MockButton label="Cancel" />
        <MockButton label="Add & drop" primary />
      </div>
    </div>
  );
}

/** Mock for `PlaceOnIlPanel`. */
export function IlStashPanelMock({ playerName }: { playerName?: string }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <FieldRow label="Player">
        <MockSelect options={[playerName ?? "Pick a player…"]} />
      </FieldRow>
      <FieldRow label="Reason">
        <MockSelect options={["Injured (10-day)", "Injured (60-day)", "Rest day"]} />
      </FieldRow>
      <FieldRow label="Free agent to fill the active spot (optional)">
        <MockInput placeholder="Search free agents to claim into the vacated slot…" />
      </FieldRow>
      <div style={{ fontSize: 11, color: "var(--am-text-faint)", lineHeight: 1.5 }}>
        Stashing on IL preserves the player's roster slot but vacates their lineup spot.
        If no replacement is selected, the lineup runs short until you fill it.
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <MockButton label="Cancel" />
        <MockButton label="Stash on IL" primary />
      </div>
    </div>
  );
}

/** Mock for `ActivateFromIlPanel`. */
export function IlActivatePanelMock({ playerName }: { playerName?: string }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <FieldRow label="IL player to activate">
        <MockSelect options={[playerName ?? "Pick from IL…"]} />
      </FieldRow>
      <FieldRow label="Active player to drop or move">
        <MockSelect options={["Auto-resolve", "Drop a specific player…"]} />
      </FieldRow>
      <div style={{ fontSize: 11, color: "var(--am-text-faint)", lineHeight: 1.5 }}>
        The bipartite matcher will find a legal slot configuration. If none exists, you'll
        be prompted to pick a drop manually.
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <MockButton label="Cancel" />
        <MockButton label="Activate" primary />
      </div>
    </div>
  );
}

/** Mock for the standalone Drop flow (commissioner-only edge case). */
export function DropPanelMock({ playerName }: { playerName?: string }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <FieldRow label="Player to drop">
        <MockSelect options={[playerName ?? "Pick a player…"]} />
      </FieldRow>
      <div style={{ fontSize: 11, color: "var(--am-text-faint)", lineHeight: 1.5 }}>
        Dropping a player without a replacement leaves the slot empty. This is a
        commissioner-only path; owners use Add & drop instead.
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <MockButton label="Cancel" />
        <MockButton label="Drop" primary />
      </div>
    </div>
  );
}
