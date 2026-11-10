// Controls for the Rules screen: a switch and a segmented choice. Both use the
// Field color (--am-field / --am-field-line); every hit target is >= 44px.
import React from "react";

const FIELD_BORDER = "1px solid var(--am-field-line)";

export function RuleSwitch({
  label, checked, disabled, onChange,
}: { label: string; checked: boolean; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        flex: "none", width: 56, minHeight: 44, display: "flex", alignItems: "center",
        padding: 0, border: 0, background: "transparent", cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "relative", width: 52, height: 30, borderRadius: 15, boxSizing: "border-box",
          border: FIELD_BORDER, background: checked ? "var(--am-accent)" : "var(--am-field)",
          color: checked ? "var(--am-on-accent)" : "var(--am-text)",
        }}
      >
        <span
          style={{
            position: "absolute", top: 3, left: checked ? 25 : 3, width: 22, height: 22, borderRadius: 11,
            background: checked ? "var(--am-on-accent)" : "var(--am-field-line)", transition: "left .12s",
          }}
        />
      </span>
    </button>
  );
}

export function RuleSegmented({
  label, options, value, disabled, onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{
        display: "flex", alignSelf: "stretch", border: FIELD_BORDER, borderRadius: 22,
        overflow: "hidden", background: "var(--am-field)",
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => !on && onChange(o.value)}
            style={{
              flex: 1, minHeight: 44, padding: "0 14px", border: 0, fontSize: 15, fontWeight: 600,
              fontFamily: "inherit", cursor: disabled ? "default" : "pointer",
              background: on ? "var(--am-accent)" : "transparent",
              color: on ? "var(--am-on-accent)" : "var(--am-text)",
              opacity: disabled && !on ? 0.6 : 1,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function RuleChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        flex: "none", padding: "4px 10px", borderRadius: 4, fontSize: 15, fontWeight: 600,
        background: "var(--am-chip)", color: "var(--am-text)", border: "1px solid var(--am-border)",
        fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
