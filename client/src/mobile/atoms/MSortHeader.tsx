import React from "react";
import { Glyph } from "./Glyph";

export type SortDir = "asc" | "desc";

interface MSortHeaderProps<K extends string> {
  k: K;
  label: React.ReactNode;
  active: K;
  dir: SortDir;
  onSort: (k: K) => void;
  align?: "left" | "right" | "center";
  width?: number | string;
}

export function MSortHeader<K extends string>({
  k,
  label,
  active,
  dir,
  onSort,
  align = "right",
  width = "auto",
}: MSortHeaderProps<K>) {
  const on = active === k;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      aria-sort={on ? (dir === "desc" ? "descending" : "ascending") : "none"}
      style={{
        width,
        padding: "8px 4px",
        textAlign: align,
        fontSize: 9.5,
        letterSpacing: 0.6,
        fontWeight: 700,
        color: on ? "var(--am-text)" : "var(--am-text-faint)",
        cursor: "pointer",
        userSelect: "none",
        display: "flex",
        alignItems: "center",
        justifyContent:
          align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
        gap: 2,
        background: "transparent",
        border: "none",
        fontFamily: "inherit",
        textTransform: "uppercase",
      }}
    >
      <span>{label}</span>
      {on && <Glyph kind={dir === "desc" ? "sortDn" : "sortUp"} size={9} />}
    </button>
  );
}
