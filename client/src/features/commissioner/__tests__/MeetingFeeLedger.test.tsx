import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { LedgerEntryRow } from "@shared/api/commissioner";
import { ApiError } from "../../../api/base";

const getMeetingFees = vi.fn();
const voidLedgerEntry = vi.fn();
vi.mock("../api", () => ({
  getMeetingFees: (...a: unknown[]) => getMeetingFees(...a),
  voidLedgerEntry: (...a: unknown[]) => voidLedgerEntry(...a),
}));

import { MeetingFeeLedger, possessive } from "../components/MeetingFeeLedger";

// Mirrors GET /api/commissioner/:leagueId/ledger (LedgerEntryRowSchema).
const row = (id: number, teamName: string, voidedAt: string | null = null): LedgerEntryRow => ({
  id, teamId: id, teamName, periodId: 41, periodName: "Period 9", type: "meeting_overtime",
  amount: 5, reason: "Over time at the Period 9 meeting", ts: "2026-11-15T20:00:00.000Z", voidedAt,
});

beforeEach(() => {
  getMeetingFees.mockReset();
  voidLedgerEntry.mockReset();
});

describe("MeetingFeeLedger", () => {
  it("lists fees; a standing fee has a 44px Void button, a voided one says Voided", async () => {
    getMeetingFees.mockResolvedValue([row(1, "Alpha"), row(2, "Bravo", "2026-11-15T21:00:00.000Z")]);
    render(<MeetingFeeLedger leagueId={20} />);
    const btn = await screen.findByRole("button", { name: "Void Alpha's $5 fee" });
    expect(btn.style.minHeight).toBe("44px");
    expect(screen.queryByRole("button", { name: /Bravo/ })).toBeNull();
    expect(screen.getByText("Voided")).toBeTruthy();
    expect(getMeetingFees).toHaveBeenCalledWith(20);
  });

  it("voids only after the confirm sheet, then reloads and tells the page", async () => {
    getMeetingFees.mockResolvedValueOnce([row(1, "Alpha")]).mockResolvedValueOnce([row(1, "Alpha", "2026-11-15T21:00:00.000Z")]);
    voidLedgerEntry.mockResolvedValue({ entryId: 1, reversalId: 9, teamId: 1, amount: 5 });
    const onVoided = vi.fn();
    render(<MeetingFeeLedger leagueId={20} onVoided={onVoided} />);

    fireEvent.click(await screen.findByRole("button", { name: "Void Alpha's $5 fee" }));
    expect(voidLedgerEntry).not.toHaveBeenCalled();
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Void Alpha's $5 fee?")).toBeTruthy();
    expect(within(sheet).getByText(/Alpha gets a \$5 credit\. .*can't be undone\./)).toBeTruthy();

    fireEvent.click(within(sheet).getByRole("button", { name: "Void fee" }));
    await waitFor(() => expect(voidLedgerEntry).toHaveBeenCalledWith(20, 1));
    await waitFor(() => expect(screen.getByText("Voided")).toBeTruthy());
    expect(onVoided).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Cancel closes the sheet without voiding", async () => {
    getMeetingFees.mockResolvedValue([row(1, "Alpha")]);
    render(<MeetingFeeLedger leagueId={20} />);
    fireEvent.click(await screen.findByRole("button", { name: "Void Alpha's $5 fee" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(voidLedgerEntry).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the void is refused, and reloads", async () => {
    getMeetingFees.mockResolvedValue([row(1, "Alpha")]);
    voidLedgerEntry.mockRejectedValue(new ApiError({
      status: 409, url: "/x", serverMessage: "This fee was already voided.",
    } as any));
    const onVoided = vi.fn();
    render(<MeetingFeeLedger leagueId={20} onVoided={onVoided} />);
    fireEvent.click(await screen.findByRole("button", { name: "Void Alpha's $5 fee" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Void fee" }));
    expect((await screen.findByRole("alert")).textContent).toBe("This fee was already voided.");
    expect(onVoided).not.toHaveBeenCalled();
    await waitFor(() => expect(getMeetingFees).toHaveBeenCalledTimes(2));
  });

  it("renders nothing when there are no meeting fees", async () => {
    getMeetingFees.mockResolvedValue([]);
    const { container } = render(<MeetingFeeLedger leagueId={20} />);
    await waitFor(() => expect(getMeetingFees).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0)); // let the resolved fetch settle
    expect(container.innerHTML).toBe("");
  });

  it("writes possessives the way people do", () => {
    expect(possessive("Alpha")).toBe("Alpha's");
    expect(possessive("Dodger Dawgs")).toBe("Dodger Dawgs'");
  });
});
