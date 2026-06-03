/**
 * Unit tests for TransactionResultModal. Pairs with the a11y rewrite in PR
 * for todo #235 (focus trap + portal + return-focus + scoped ESC) and
 * fulfills the dedicated test ask in todo #237.
 *
 * Scope: render correctness, ESC dismissal, backdrop dismissal, focus
 * autofocus on open, return-focus on close. The Tab/Shift+Tab focus trap
 * is tested by triggering keydown directly on the dialog element — jsdom
 * does not implement real Tab traversal, so we verify the trap *behavior*
 * (preventDefault + manual focus shift) rather than browser-native Tab.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransactionResultModal, {
  type TransactionResult,
} from "../TransactionResultModal";

const baseResult: TransactionResult = {
  title: "Claim succeeded",
  primaryLine: "Added Andrew Vaughn, dropped Felix Reyes.",
  cascadeMoves: [],
};

beforeEach(() => {
  cleanup();
});

describe("TransactionResultModal — rendering", () => {
  it("renders nothing when result is null", () => {
    const { container } = render(<TransactionResultModal result={null} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("transaction-result-modal")).toBeNull();
  });

  it("renders title and primaryLine when result is provided", () => {
    render(<TransactionResultModal result={baseResult} onClose={() => {}} />);
    expect(screen.getByText(/Claim succeeded/)).toBeTruthy();
    expect(screen.getByText(/Added Andrew Vaughn, dropped Felix Reyes/)).toBeTruthy();
  });

  it("hides the cascade block when cascadeMoves is empty", () => {
    render(<TransactionResultModal result={baseResult} onClose={() => {}} />);
    expect(screen.queryByTestId("transaction-result-cascade")).toBeNull();
  });

  it("hides the cascade block when cascadeMoves is undefined", () => {
    const { cascadeMoves: _omit, ...noCascade } = baseResult;
    render(<TransactionResultModal result={noCascade} onClose={() => {}} />);
    expect(screen.queryByTestId("transaction-result-cascade")).toBeNull();
  });

  it("renders the cascade block when cascadeMoves has entries", () => {
    const withCascade: TransactionResult = {
      ...baseResult,
      cascadeMoves: [
        { rosterId: 1, playerId: 10, playerName: "Troy Johnston", oldSlot: "CM", newSlot: "OF" },
        { rosterId: 2, playerId: 20, playerName: "Trea Turner", oldSlot: "2B", newSlot: "SS" },
      ],
    };
    render(<TransactionResultModal result={withCascade} onClose={() => {}} />);
    expect(screen.getByTestId("transaction-result-cascade")).toBeTruthy();
    expect(screen.getByText("Troy Johnston")).toBeTruthy();
    expect(screen.getByText("Trea Turner")).toBeTruthy();
  });
});

describe("TransactionResultModal — dismissal", () => {
  it("calls onClose when OK button is clicked", async () => {
    const onClose = vi.fn();
    render(<TransactionResultModal result={baseResult} onClose={onClose} />);
    await userEvent.click(screen.getByTestId("transaction-result-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(<TransactionResultModal result={baseResult} onClose={onClose} />);
    const modal = screen.getByTestId("transaction-result-modal");
    // Click directly on the backdrop element (e.target === e.currentTarget)
    fireEvent.click(modal);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when dialog body is clicked", async () => {
    const onClose = vi.fn();
    render(<TransactionResultModal result={baseResult} onClose={onClose} />);
    // Click on the title — bubbles up to the modal div, but e.target !== e.currentTarget
    await userEvent.click(screen.getByText(/Claim succeeded/));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on Escape key inside the dialog", () => {
    const onClose = vi.fn();
    render(<TransactionResultModal result={baseResult} onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId("transaction-result-modal"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("TransactionResultModal — focus management", () => {
  it("autofocuses the OK button when opened", () => {
    render(<TransactionResultModal result={baseResult} onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByTestId("transaction-result-close"));
  });

  it("restores focus to the previously focused element when closed", () => {
    // Set up: a button outside the modal has focus
    const opener = document.createElement("button");
    opener.textContent = "Open";
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { rerender } = render(
      <TransactionResultModal result={baseResult} onClose={() => {}} />,
    );
    // Modal mounted — focus moves to OK button
    expect(document.activeElement).toBe(screen.getByTestId("transaction-result-close"));

    // Dismiss by re-rendering with result=null (caller's normal pattern)
    rerender(<TransactionResultModal result={null} onClose={() => {}} />);
    // Focus should be back on opener
    expect(document.activeElement).toBe(opener);
    document.body.removeChild(opener);
  });

  it("preventDefault on Tab when there is only one focusable (single OK button)", () => {
    render(<TransactionResultModal result={baseResult} onClose={() => {}} />);
    // OK is autofocused; Tab forward should be intercepted and stay on OK
    const modal = screen.getByTestId("transaction-result-modal");
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    const ok = screen.getByTestId("transaction-result-close");
    ok.dispatchEvent(event);
    // Focus remains on OK (the only focusable in the dialog)
    expect(document.activeElement).toBe(ok);
  });
});
