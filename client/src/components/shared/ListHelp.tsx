import { useEffect, useId, useRef, useState } from "react";

const TEXT = {
  wire: "Your wire list: players you'd pick up between periods, in order.",
  auction:
    "Your auction list: players you plan to put up, in order. If your clock runs out, the top one goes up.",
} as const;

/**
 * Small ⓘ next to a list heading. Opens an inline note on tap/click, on mouse
 * hover, and on keyboard focus; Escape, a second tap, or a tap elsewhere closes
 * it. Not a modal.
 */
export function ListHelp({ kind }: { kind: "wire" | "auction" }) {
  const [pinned, setPinned] = useState(false); // opened by tap/click
  const [hover, setHover] = useState(false); // mouse hover or keyboard focus
  const rootRef = useRef<HTMLSpanElement>(null);
  const noteId = useId();
  const visible = pinned || hover;

  useEffect(() => {
    if (!visible) return;
    const close = () => {
      setPinned(false);
      setHover(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [visible]);

  const keyboardFocus = (el: HTMLElement) => {
    try {
      return el.matches(":focus-visible");
    } catch {
      return false;
    }
  };

  return (
    <span
      ref={rootRef}
      style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}
    >
      <button
        type="button"
        aria-label="What is this list?"
        aria-expanded={visible}
        aria-describedby={visible ? noteId : undefined}
        onClick={() => {
          if (pinned) {
            setPinned(false);
            setHover(false);
          } else {
            setPinned(true);
          }
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setHover(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHover(false);
        }}
        onFocus={(e) => {
          if (keyboardFocus(e.currentTarget)) setHover(true);
        }}
        onBlur={() => setHover(false)}
        style={{
          minWidth: 44,
          minHeight: 44,
          margin: "-12px -8px",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--lg-text-muted, var(--am-text-muted))",
          fontSize: 17,
          lineHeight: 1,
        }}
      >
        <span aria-hidden="true">ⓘ</span>
      </button>
      {visible && (
        <span
          id={noteId}
          role="note"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 50,
            marginTop: 4,
            width: "max-content",
            maxWidth: "min(280px, 80vw)",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--lg-border-subtle)",
            background: "var(--lg-card-bg)",
            color: "var(--lg-text-primary)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.4,
            textAlign: "left",
            textTransform: "none",
            letterSpacing: "normal",
            whiteSpace: "normal",
          }}
        >
          {TEXT[kind]}
        </span>
      )}
    </span>
  );
}
