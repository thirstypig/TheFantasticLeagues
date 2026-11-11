import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const open = vi.fn();
vi.mock("../PlayerCardProvider", () => ({ usePlayerCard: () => ({ open, close: vi.fn() }) }));

import { useOpenPlayerCard } from "../useOpenPlayerCard";

describe("useOpenPlayerCard", () => {
  it("opens the card with the numeric mlbId", () => {
    const { result } = renderHook(() => useOpenPlayerCard());
    result.current({ mlb_id: "660271" });
    expect(open).toHaveBeenCalledWith(660271);
  });
  it("resolves Ohtani's pitcher placeholder to his real id", () => {
    const { result } = renderHook(() => useOpenPlayerCard());
    result.current({ mlb_id: "1660271" });
    expect(open).toHaveBeenLastCalledWith(660271);
  });
  it("no-ops without a usable id", () => {
    open.mockClear();
    const { result } = renderHook(() => useOpenPlayerCard());
    result.current({ mlb_id: "" });
    result.current({ mlb_id: "abc" });
    result.current(null);
    expect(open).not.toHaveBeenCalled();
  });
});
