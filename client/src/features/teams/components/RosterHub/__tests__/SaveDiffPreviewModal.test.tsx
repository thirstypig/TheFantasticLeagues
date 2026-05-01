import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SaveDiffPreviewModal, type DiffRow } from "../SaveDiffPreviewModal";
import type { PendingChangeFailure } from "../../../hooks/usePendingChanges";

const ROWS: DiffRow[] = [
  { id: "1", kind: "swap", text: "SWAP 2B ↔ SS" },
  {
    id: "2",
    kind: "il_stash",
    text: "IL STASH Trea Turner (Injured 10-Day)",
  },
  {
    id: "3",
    kind: "fa_add",
    text: "FA ADD Jarren Duran — drops Brandon Lockridge",
    dependsOn: "IL stash #2",
  },
  {
    id: "4",
    kind: "il_activate",
    text: "IL ACTIVATE Yamamoto → P — drops Reliever Guy",
  },
];

describe("SaveDiffPreviewModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <SaveDiffPreviewModal
        open={false}
        rows={ROWS}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the title with the row count", () => {
    render(
      <SaveDiffPreviewModal open rows={ROWS} onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByText(/Save 4 changes\?/i)).toBeInTheDocument();
  });

  it("renders all four pending change kinds with their badges", () => {
    render(
      <SaveDiffPreviewModal open rows={ROWS} onConfirm={() => {}} onCancel={() => {}} />,
    );
    const rows = screen.getAllByTestId("save-diff-preview-row");
    expect(rows).toHaveLength(4);
    expect(rows[0].dataset.kind).toBe("swap");
    expect(rows[1].dataset.kind).toBe("il_stash");
    expect(rows[2].dataset.kind).toBe("fa_add");
    expect(rows[3].dataset.kind).toBe("il_activate");
  });

  it("renders the dependency badge when dependsOn is set", () => {
    render(
      <SaveDiffPreviewModal open rows={ROWS} onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByText(/depends on IL stash #2/i)).toBeInTheDocument();
  });

  it("invokes onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <SaveDiffPreviewModal open rows={ROWS} onConfirm={onConfirm} onCancel={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("save-diff-preview-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("invokes onCancel when the cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <SaveDiffPreviewModal open rows={ROWS} onConfirm={() => {}} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("invokes onCancel when the backdrop is clicked", () => {
    const onCancel = vi.fn();
    render(
      <SaveDiffPreviewModal open rows={ROWS} onConfirm={() => {}} onCancel={onCancel} />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while saving", () => {
    render(
      <SaveDiffPreviewModal open rows={ROWS} saving onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByTestId("save-diff-preview-confirm")).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
  });

  it("shows 'Saving…' on the confirm button while saving", () => {
    render(
      <SaveDiffPreviewModal open rows={ROWS} saving onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByTestId("save-diff-preview-confirm")).toHaveTextContent("Saving…");
  });

  describe("inline failure rendering (Complex-#6)", () => {
    const failures: PendingChangeFailure[] = [
      {
        changeId: "3",
        kind: "fa_add",
        reason: "Player no longer FA — cancel this change",
      },
    ];

    it("paints the failed row with a red border and inline error", () => {
      render(
        <SaveDiffPreviewModal
          open
          rows={ROWS}
          failures={failures}
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );
      const rows = screen.getAllByTestId("save-diff-preview-row");
      expect(rows[2].dataset.failed).toBe("true");
      expect(rows[0].dataset.failed).toBe("false");
      expect(screen.getByTestId("save-diff-preview-row-error")).toHaveTextContent(
        /no longer FA/i,
      );
    });

    it("renders the global error banner at the top", () => {
      render(
        <SaveDiffPreviewModal
          open
          rows={ROWS}
          failures={failures}
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );
      expect(screen.getByTestId("save-diff-preview-error-banner")).toBeInTheDocument();
    });

    it("changes the confirm button to 'Retry save' when failures exist", () => {
      render(
        <SaveDiffPreviewModal
          open
          rows={ROWS}
          failures={failures}
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );
      expect(screen.getByTestId("save-diff-preview-confirm")).toHaveTextContent(
        "Retry save",
      );
    });

    it("renders a per-row revert button when onRevertItem is supplied", () => {
      const onRevertItem = vi.fn();
      render(
        <SaveDiffPreviewModal
          open
          rows={ROWS}
          failures={failures}
          onConfirm={() => {}}
          onCancel={() => {}}
          onRevertItem={onRevertItem}
        />,
      );
      const revertBtn = screen.getByTestId("save-diff-preview-revert");
      fireEvent.click(revertBtn);
      expect(onRevertItem).toHaveBeenCalledWith("3");
    });

    it("does not render row-revert buttons for non-failed rows", () => {
      const onRevertItem = vi.fn();
      render(
        <SaveDiffPreviewModal
          open
          rows={ROWS}
          failures={failures}
          onConfirm={() => {}}
          onCancel={() => {}}
          onRevertItem={onRevertItem}
        />,
      );
      // Only the failed row gets the inline revert affordance — count of 1.
      expect(screen.getAllByTestId("save-diff-preview-revert")).toHaveLength(1);
    });
  });
});
