import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmSheet } from "../ConfirmSheet";

function setup(over: Partial<React.ComponentProps<typeof ConfirmSheet>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmSheet
      open
      title="Close Period 7?"
      body="Standings lock. You can't undo this."
      confirmLabel="Close period"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...over}
    />,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ConfirmSheet open={false} title="t" body="b" confirmLabel="Go" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("is a labelled dialog with focus on the confirm button", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Close Period 7?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Standings lock. You can't undo this.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close period" }));
  });

  it("Esc calls onCancel", () => {
    const { onCancel, onConfirm } = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("a scrim click calls onCancel; a click inside the panel does not", () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("confirm-sheet-scrim"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("confirm and cancel buttons call their handlers", () => {
    const { onCancel, onConfirm } = setup({ cancelLabel: "Not yet" });
    fireEvent.click(screen.getByRole("button", { name: "Close period" }));
    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("with busy, both buttons are disabled and a confirm click does not call onConfirm", () => {
    const { onConfirm, onCancel } = setup({ busy: true });
    const confirm = screen.getByRole("button", { name: "Close period" }) as HTMLButtonElement;
    const cancel = screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
    fireEvent.click(confirm);
    fireEvent.click(cancel);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("with busy, Esc and scrim do not cancel", () => {
    const { onCancel } = setup({ busy: true });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByTestId("confirm-sheet-scrim"));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
