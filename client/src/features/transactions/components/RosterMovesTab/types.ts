// Re-export the shared `RosterMovesPlayer` type so panel imports continue
// to work without touching the call sites. The single source of truth
// (schema + type) lives in `shared/api/rosterMoves.ts` — see todo #116
// and `MEMORY.md` `feedback_partial_browser_verification.md` for the bug
// class this consolidation closes. The runtime `RosterMovesPlayerSchema`
// export is intentionally NOT re-exported here: keeping this file
// type-only preserves the tree-shake invariant that lets test bundles
// skip the cross-side `shared/` directory entirely.
export type { RosterMovesPlayer } from "@shared/api/rosterMoves";

export type RosterMovesMode = "add-drop" | "place-il" | "activate-il";

export const MODES: RosterMovesMode[] = ["add-drop", "place-il", "activate-il"];

export const MODE_LABEL: Record<RosterMovesMode, string> = {
  "add-drop": "Add / Drop",
  "place-il": "Place on IL",
  "activate-il": "Activate from IL",
};
