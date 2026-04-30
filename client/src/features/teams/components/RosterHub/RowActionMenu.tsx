// client/src/features/teams/components/RosterHub/RowActionMenu.tsx
//
// Per-row "..." dropdown menu — the entry point for AddDrop / IL
// Stash / IL Activate flows. Clicking an item dispatches a callback
// that the parent uses to trigger the existing modals (PR2 wires the
// real panels in; the preview opens a placeholder modal).
//
// Closes on:
//   - Escape key
//   - Click outside the trigger or the menu
//   - Selecting any action

import { useEffect, useRef } from "react";

export interface RowAction {
  key: string;
  label: string;
  /** Visible icon glyph (left margin). */
  glyph?: string;
  destructive?: boolean;
  onSelect: () => void;
  /** Hide this action when false; useful for "Activate from IL" only on IL rows. */
  visible?: boolean;
}

interface RowActionMenuProps {
  actions: RowAction[];
  open: boolean;
  onClose: () => void;
  /**
   * Anchor element bounding rect — menu floats below+right of it.
   * Static preview passes a fixed position; real wiring uses the
   * trigger's `getBoundingClientRect()`.
   */
  anchorRect: DOMRect | null;
}

export function RowActionMenu({ actions, open, onClose, anchorRect }: RowActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Position: bottom-right corner of the trigger. Falls back to the
  // viewport center if no anchor was provided (e.g. keyboard-opened
  // menus pre-PR2 wiring).
  const top = anchorRect ? anchorRect.bottom + 4 : window.innerHeight / 2;
  const left = anchorRect ? Math.max(8, anchorRect.right - 200) : window.innerWidth / 2 - 100;

  // Filter to visible actions; render a separator before destructive
  // items if the previous action wasn't already destructive.
  const visible = actions.filter((a) => a.visible !== false);

  return (
    <div ref={ref} className="am-roster-action-menu" role="menu" style={{ top, left }}>
      {visible.map((action, idx) => {
        const prev = visible[idx - 1];
        const needsSep = action.destructive && prev && !prev.destructive;
        return (
          <div key={action.key}>
            {needsSep && <hr aria-hidden />}
            <button
              type="button"
              role="menuitem"
              data-destructive={action.destructive ? "true" : undefined}
              onClick={() => {
                action.onSelect();
                onClose();
              }}
            >
              {action.glyph && <span aria-hidden>{action.glyph}</span>}
              <span>{action.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
