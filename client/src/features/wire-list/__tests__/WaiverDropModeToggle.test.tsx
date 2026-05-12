/**
 * Unit tests for WaiverDropModeToggle.
 *
 * Regression targets:
 *   - onChange must NOT fire when clicking the already-active mode
 *   - onChange must NOT fire when disabled
 *   - Both REL and IL labels must always be rendered
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WaiverDropModeToggle } from "../components/WaiverDropModeToggle";

describe("WaiverDropModeToggle", () => {
  it("renders REL and IL buttons", () => {
    render(<WaiverDropModeToggle value="RELEASE" disabled={false} onChange={vi.fn()} />);
    expect(screen.getByText("REL")).toBeTruthy();
    expect(screen.getByText("IL")).toBeTruthy();
  });

  it("calls onChange with IL_STASH when IL clicked and current value is RELEASE", () => {
    const onChange = vi.fn();
    render(<WaiverDropModeToggle value="RELEASE" disabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByText("IL"));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("IL_STASH");
  });

  it("does NOT call onChange when clicking the already-active mode", () => {
    const onChange = vi.fn();
    render(<WaiverDropModeToggle value="RELEASE" disabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByText("REL")); // already active
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does NOT call onChange when disabled", () => {
    const onChange = vi.fn();
    render(<WaiverDropModeToggle value="RELEASE" disabled={true} onChange={onChange} />);
    fireEvent.click(screen.getByText("IL"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("marks buttons as disabled when disabled prop is true", () => {
    render(<WaiverDropModeToggle value="RELEASE" disabled={true} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });
});
