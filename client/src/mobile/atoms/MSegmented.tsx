import React from "react";

interface MSegmentedProps<T extends string> {
  options: readonly T[];
  active: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export function MSegmented<T extends string>({ options, active, onChange, ariaLabel }: MSegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        padding: 3,
        gap: 2,
        borderRadius: 12,
        background: "var(--am-chip)",
        border: "1px solid var(--am-border)",
      }}
    >
      {options.map((o) => {
        const on = o === active;
        return (
          <button
            key={o}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o)}
            style={{
              flex: 1,
              padding: "6px 0",
              textAlign: "center",
              fontSize: 11.5,
              fontWeight: on ? 600 : 500,
              color: on ? "var(--am-text)" : "var(--am-text-muted)",
              background: on ? "var(--am-surface-strong)" : "transparent",
              borderRadius: 9,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              minHeight: 32,
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
