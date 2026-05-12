/**
 * Unit tests for WireListRow.
 *
 * Regression targets:
 *   - Controls (▲▼×) must be hidden when isReadOnly — not just visually absent
 *   - Drop mode toggle only appears for drop rows (when dropMode prop is provided)
 *   - ▲ disabled for isFirst row; ▼ disabled for isLast row
 *   - isPending reduces opacity via inline style
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WireListRow } from "../components/WireListRow";

const defaultProps = {
  rank: 1,
  playerName: "Shohei Ohtani",
  playerPos: "SP",
  playerTeam: "LAD",
  isPending: false,
  isReadOnly: false,
};

describe("WireListRow — content", () => {
  it("renders rank, position, player name, and team", () => {
    render(<WireListRow {...defaultProps} />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("SP")).toBeTruthy();
    expect(screen.getByText("Shohei Ohtani")).toBeTruthy();
    expect(screen.getByText("LAD")).toBeTruthy();
  });
});

describe("WireListRow — controls visibility", () => {
  it("shows Move up, Move down, Remove controls when NOT readOnly", () => {
    render(<WireListRow {...defaultProps} isReadOnly={false} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByLabelText("Move up")).toBeTruthy();
    expect(screen.getByLabelText("Move down")).toBeTruthy();
    expect(screen.getByLabelText("Remove")).toBeTruthy();
  });

  it("hides controls when isReadOnly", () => {
    render(<WireListRow {...defaultProps} isReadOnly={true} />);
    expect(screen.queryByLabelText("Move up")).toBeNull();
    expect(screen.queryByLabelText("Move down")).toBeNull();
    expect(screen.queryByLabelText("Remove")).toBeNull();
  });

  it("disables Move up when isFirst", () => {
    render(<WireListRow {...defaultProps} isFirst={true} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByLabelText("Move up")).toBeDisabled();
    expect(screen.getByLabelText("Move down")).not.toBeDisabled();
  });

  it("disables Move down when isLast", () => {
    render(<WireListRow {...defaultProps} isLast={true} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByLabelText("Move down")).toBeDisabled();
    expect(screen.getByLabelText("Move up")).not.toBeDisabled();
  });
});

describe("WireListRow — drop mode toggle", () => {
  it("shows WaiverDropModeToggle when dropMode prop provided", () => {
    render(
      <WireListRow
        {...defaultProps}
        dropMode="RELEASE"
        onDropModeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("REL")).toBeTruthy();
    expect(screen.getByText("IL")).toBeTruthy();
  });

  it("does not render WaiverDropModeToggle when dropMode not provided (Add row)", () => {
    render(<WireListRow {...defaultProps} />);
    expect(screen.queryByText("REL")).toBeNull();
    expect(screen.queryByText("IL")).toBeNull();
  });

  it("calls onDropModeChange when toggling from RELEASE to IL_STASH", () => {
    const onDropModeChange = vi.fn();
    render(
      <WireListRow
        {...defaultProps}
        dropMode="RELEASE"
        onDropModeChange={onDropModeChange}
      />,
    );
    fireEvent.click(screen.getByText("IL"));
    expect(onDropModeChange).toHaveBeenCalledWith("IL_STASH");
  });
});

describe("WireListRow — pending state", () => {
  it("applies reduced opacity when isPending", () => {
    const { container } = render(<WireListRow {...defaultProps} isPending={true} />);
    const row = container.firstChild as HTMLElement;
    expect(row.style.opacity).toBe("0.5");
  });

  it("has full opacity when not pending", () => {
    const { container } = render(<WireListRow {...defaultProps} isPending={false} />);
    const row = container.firstChild as HTMLElement;
    expect(row.style.opacity).toBe("1");
  });
});
