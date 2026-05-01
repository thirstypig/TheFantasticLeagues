import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PendingChangeBar } from "../PendingChangeBar";

describe("PendingChangeBar", () => {
  it("renders nothing when count is zero and no error", () => {
    const { container } = render(
      <PendingChangeBar count={0} onRevertAll={() => {}} onSave={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the count summary in the singular for 1 change", () => {
    render(<PendingChangeBar count={1} onRevertAll={() => {}} onSave={() => {}} />);
    expect(screen.getByText("1 pending change")).toBeInTheDocument();
  });

  it("renders the count summary in the plural for >1 changes", () => {
    render(<PendingChangeBar count={3} onRevertAll={() => {}} onSave={() => {}} />);
    expect(screen.getByText("3 pending changes")).toBeInTheDocument();
  });

  it("invokes onRevertAll when the Revert all button is clicked", () => {
    const onRevertAll = vi.fn();
    render(<PendingChangeBar count={2} onRevertAll={onRevertAll} onSave={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /revert all/i }));
    expect(onRevertAll).toHaveBeenCalledTimes(1);
  });

  it("invokes onSave when the Save button is clicked", () => {
    const onSave = vi.fn();
    render(<PendingChangeBar count={2} onRevertAll={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("shows the saving label and disables both buttons during save", () => {
    const onSave = vi.fn();
    const onRevertAll = vi.fn();
    render(
      <PendingChangeBar
        count={2}
        onRevertAll={onRevertAll}
        onSave={onSave}
        saving={true}
      />,
    );
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /revert all/i })).toBeDisabled();
  });

  it("renders the error banner when saveError is non-null", () => {
    render(
      <PendingChangeBar
        count={1}
        onRevertAll={() => {}}
        onSave={() => {}}
        saveError="network down"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("network down");
  });

  it("invokes onRetry when the Retry button is clicked", () => {
    const onRetry = vi.fn();
    render(
      <PendingChangeBar
        count={1}
        onRevertAll={() => {}}
        onSave={() => {}}
        saveError="oops"
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("invokes onDismissError when the dismiss × button is clicked", () => {
    const onDismissError = vi.fn();
    render(
      <PendingChangeBar
        count={0}
        onRevertAll={() => {}}
        onSave={() => {}}
        saveError="boom"
        onDismissError={onDismissError}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /dismiss error/i }));
    expect(onDismissError).toHaveBeenCalledTimes(1);
  });

  it("renders the error banner alone when count is 0 and saveError is set", () => {
    render(
      <PendingChangeBar
        count={0}
        onRevertAll={() => {}}
        onSave={() => {}}
        saveError="lingering error"
      />,
    );
    expect(screen.queryByText(/pending change/i)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("lingering error");
  });
});
