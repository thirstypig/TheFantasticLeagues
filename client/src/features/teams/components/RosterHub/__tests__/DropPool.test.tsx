// DropPool — render + restore tests for the FA scenario displaced
// player surface (direction-lock FA-#5).

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DropPool } from "../DropPool";

describe("DropPool", () => {
  it("renders nothing when rows is empty", () => {
    const { container } = render(<DropPool rows={[]} onRestore={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one row per displaced player with the change id and slot context", () => {
    render(
      <DropPool
        rows={[
          { changeId: "fa-1", rosterId: 7, playerId: 707, name: "Mike Trout", slot: "OF", faName: "Ohtani" },
          { changeId: "fa-2", rosterId: 8, playerId: 808, name: "Bench Guy", slot: "BN" },
        ]}
        onRestore={vi.fn()}
      />,
    );
    const rows = screen.getAllByTestId("drop-pool-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-change-id", "fa-1");
    expect(rows[0]).toHaveTextContent("Mike Trout");
    expect(rows[0]).toHaveTextContent("from OF");
    expect(rows[0]).toHaveTextContent("for Ohtani");
    expect(rows[1]).toHaveTextContent("Bench Guy");
    expect(rows[1]).toHaveTextContent("from BN");
  });

  it("singular vs plural noun in the count label", () => {
    const { rerender } = render(
      <DropPool
        rows={[{ changeId: "fa-1", rosterId: 7, playerId: 707, name: "X", slot: "BN" }]}
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByText(/Drop pool · 1 player$/)).toBeInTheDocument();

    rerender(
      <DropPool
        rows={[
          { changeId: "fa-1", rosterId: 7, playerId: 707, name: "X", slot: "BN" },
          { changeId: "fa-2", rosterId: 8, playerId: 808, name: "Y", slot: "BN" },
        ]}
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByText(/Drop pool · 2 players$/)).toBeInTheDocument();
  });

  it("Restore click bubbles the changeId back to the parent", () => {
    const onRestore = vi.fn();
    render(
      <DropPool
        rows={[{ changeId: "fa-9", rosterId: 7, playerId: 707, name: "Trout", slot: "OF" }]}
        onRestore={onRestore}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Restore Trout to roster/));
    expect(onRestore).toHaveBeenCalledWith("fa-9");
  });
});
