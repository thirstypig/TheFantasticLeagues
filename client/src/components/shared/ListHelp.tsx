import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const btnRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const noteId = useId();
  const visible = pinned || hover;

  // The note is portaled to <body> (ancestors clip with overflow:hidden and
  // backdrop-filter re-roots position:fixed), placed from the button's rect and
  // clamped inside the viewport with a 16px gutter.
  useLayoutEffect(() => {
    if (!visible) {
      setPos(null);
      return;
    }
    const btn = btnRef.current;
    const note = noteRef.current;
    if (!btn || !note) return;
    const r = btn.getBoundingClientRect();
    const w = note.offsetWidth;
    const h = note.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(16, Math.min(r.left + r.width / 2 - w / 2, vw - 16 - w));
    let top = r.bottom + 4;
    if (top + h > vh - 16 && r.top - 4 - h >= 16) top = r.top - 4 - h;
    setPos({ top, left });
  }, [visible, kind]);

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
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || noteRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
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
        ref={btnRef}
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
        onPointerMove={(e) => {
          // A mouse already resting on the button (e.g. after click then Escape)
          // fires no pointerenter, so hover is also re-armed on movement.
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
      {visible &&
        createPortal(
        <span
          ref={noteRef}
          id={noteId}
          role="note"
          style={{
            position: "fixed",
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            visibility: pos ? "visible" : "hidden",
            zIndex: 1000,
            width: "max-content",
            maxWidth: "min(280px, calc(100vw - 32px))",
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
        </span>,
          document.body,
        )}
    </span>
  );
}
