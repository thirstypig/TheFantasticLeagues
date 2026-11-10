/*
 * AccountSheet — the mobile account menu as a bottom sheet (scrim + panel
 * anchored to the bottom). Esc or a scrim tap closes it; focus moves into the
 * panel on open and returns to the opener on close.
 */
import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ACCOUNT_LINKS } from "../lib/navModel";

interface AccountSheetProps {
  isAdmin: boolean;
  onClose: () => void;
  onSignOut: () => void;
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  minHeight: 48,
  padding: "0 20px",
  fontSize: 17,
  fontFamily: "inherit",
  color: "var(--am-text)",
  background: "transparent",
  border: "none",
  borderTop: "1px solid var(--am-border)",
  textAlign: "left",
  textDecoration: "none",
  width: "100%",
  cursor: "pointer",
};

export function AccountSheet({ isAdmin, onClose, onSignOut }: AccountSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>("a, button"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <>
      <div
        aria-hidden
        data-testid="account-sheet-scrim"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.45)" }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 61,
          background: "var(--am-surface)",
          borderTop: "1px solid var(--am-border-strong)",
          borderRadius: "12px 12px 0 0",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {ACCOUNT_LINKS(isAdmin).map((l) => (
          <Link key={l.to} to={l.to} onClick={onClose} style={rowStyle}>
            {l.label}
          </Link>
        ))}
        <button type="button" onClick={onSignOut} style={{ ...rowStyle, color: "var(--am-text-muted)" }}>
          Sign out
        </button>
      </div>
    </>
  );
}
