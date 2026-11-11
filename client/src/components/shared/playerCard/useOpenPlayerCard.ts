import { useCallback } from "react";
import { usePlayerCard } from "./PlayerCardProvider";
import { cardMlbId } from "../playerDetailHelpers";

/**
 * Returns `(row) => void` that opens the player card for a row carrying an
 * `mlb_id`. Applies the placeholder-id resolution and no-ops when the row has
 * no usable id.
 */
export function useOpenPlayerCard(): (row: { mlb_id?: unknown } | null | undefined) => void {
  const { open } = usePlayerCard();
  return useCallback(
    (row) => {
      const id = cardMlbId(row?.mlb_id);
      if (id) open(id);
    },
    [open],
  );
}
