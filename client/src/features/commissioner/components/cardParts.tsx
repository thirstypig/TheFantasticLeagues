// Shared card helpers for the commissioner hub pages: per-card async loading,
// row styling, and the skeleton / error states each card renders on its own.
import React, { useEffect, useState } from "react";

export type Load<T> = { state: "loading" } | { state: "error" } | { state: "ready"; data: T };

/** Runs `fn` on mount and whenever `deps` change; a stale result is dropped. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): Load<T> {
  const [s, setS] = useState<Load<T>>({ state: "loading" });
  useEffect(() => {
    let live = true;
    setS({ state: "loading" });
    fn().then(
      (data) => live && setS({ state: "ready", data }),
      () => live && setS({ state: "error" }),
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return s;
}

export const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minHeight: 48,
  padding: "10px 16px",
  borderBottom: "1px solid var(--am-border)",
  color: "var(--am-text)",
  textDecoration: "none",
  fontSize: 17,
};

/** Full-width primary action button for the guided job pages. */
export const PRIMARY: React.CSSProperties = {
  minHeight: 48,
  width: "100%",
  padding: "0 16px",
  borderRadius: 6,
  border: "1px solid var(--am-accent)",
  background: "var(--am-accent)",
  color: "var(--am-on-accent)",
  fontSize: 17,
  fontWeight: 600,
  cursor: "pointer",
};

export const SECONDARY: React.CSSProperties = {
  ...PRIMARY,
  border: "1px solid var(--am-border-strong)",
  background: "transparent",
  color: "var(--am-text)",
};

/** Inline text link with a 44px tap target. */
export const LINK: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
  fontSize: 17,
  color: "var(--am-accent)",
};

export const MUTED: React.CSSProperties = { fontSize: 17, color: "var(--am-text-muted)" };

export function Skeleton() {
  return (
    <div aria-busy="true" style={{ padding: 16 }}>
      {[0, 1].map((i) => (
        <div key={i} style={{ height: 16, marginBottom: 10, borderRadius: 4, background: "var(--am-surface-alt)" }} />
      ))}
    </div>
  );
}

export function CardError({ children }: { children: React.ReactNode }) {
  return <p style={{ padding: 16, margin: 0, fontSize: 17, color: "var(--am-negative)" }}>{children}</p>;
}
