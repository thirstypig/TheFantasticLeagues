import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ActivityHistoryTab from "../ActivityHistoryTab";
import type { TransactionEvent } from "../../api";
import type { TradeProposal } from "../../../trades/api";

// Pin "now" so the 30-day range filter doesn't drop the test fixtures as
// the calendar marches forward. Picked slightly after the fixture
// timestamps below so all rows fall inside the default 30-day window.
const FAKE_NOW = new Date("2026-04-20T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FAKE_NOW);
  return () => {
    vi.useRealTimers();
  };
});

const NORMAL_TX: TransactionEvent = {
  id: 1,
  leagueId: 1,
  teamId: 10,
  playerId: 100,
  type: "ADD",
  amount: null,
  relatedTransactionId: null,
  // Submitted at 18:00 UTC, effective at next-day midnight UTC — the
  // canonical "live claim" shape from server/lib/utils.ts:nextDayEffective.
  submittedAt: "2026-04-15T18:00:00.000Z",
  effDate: "2026-04-16T00:00:00.000Z",
  processedAt: null,
  status: "APPROVED",
  team: { name: "Aces" },
  player: { name: "Mike Trout" },
  transactionRaw: "Claimed Mike Trout",
};

const BACKDATED_TX: TransactionEvent = {
  id: 2,
  leagueId: 1,
  teamId: 10,
  playerId: 200,
  type: "ADD",
  amount: null,
  relatedTransactionId: null,
  // Submitted on 2026-04-15 but commissioner chose effective date 2026-04-10 —
  // a 5-day backdate. Both dates fall inside the default 30-day range.
  submittedAt: "2026-04-15T18:00:00.000Z",
  effDate: "2026-04-10T00:00:00.000Z",
  processedAt: null,
  status: "APPROVED",
  team: { name: "Aces" },
  player: { name: "Backdated Guy" },
  transactionRaw: "Claimed Backdated Guy",
};

describe("ActivityHistoryTab — backdated marker", () => {
  it("renders the backdated chip on a backdated row", () => {
    render(
      <ActivityHistoryTab
        completedTrades={[]}
        transactions={[BACKDATED_TX]}
      />,
    );

    // The row gets a testid, and the marker chip has its own.
    const row = screen.getByTestId("history-row-backdated");
    const marker = within(row).getByTestId("backdated-marker");
    expect(marker).toBeInTheDocument();
    expect(marker.textContent).toMatch(/Submitted:/);
    expect(marker.getAttribute("title")).toMatch(/Submitted .* effective/);
  });

  it("does not render the backdated chip on a normal forward-dated row", () => {
    render(
      <ActivityHistoryTab
        completedTrades={[]}
        transactions={[NORMAL_TX]}
      />,
    );

    expect(screen.queryByTestId("history-row-backdated")).not.toBeInTheDocument();
    expect(screen.queryByTestId("backdated-marker")).not.toBeInTheDocument();
    // Normal row still renders — just without the chip.
    expect(screen.getByText("Mike Trout")).toBeInTheDocument();
  });

  it('"Backdated only" filter hides normal rows and trades', () => {
    const trade: TradeProposal = {
      id: 999,
      status: "PROCESSED",
      createdAt: "2026-04-18T10:00:00.000Z",
      proposingTeam: { id: 10, name: "Aces" },
      acceptingTeam: { id: 11, name: "Beats" },
      items: [],
      // Older trade fields the component doesn't touch are loosely typed
      // as `any` upstream — cast covers the fixture without rewiring the
      // shared TradeProposal type.
    } as unknown as TradeProposal;

    render(
      <ActivityHistoryTab
        completedTrades={[trade]}
        transactions={[NORMAL_TX, BACKDATED_TX]}
      />,
    );

    // Pre-filter: 3 events visible.
    expect(screen.getByText(/3 events/)).toBeInTheDocument();
    expect(screen.getByText("Mike Trout")).toBeInTheDocument();
    expect(screen.getByText("Backdated Guy")).toBeInTheDocument();

    // Toggle the filter on.
    const chip = screen.getByRole("button", { name: /Backdated only/i });
    fireEvent.click(chip);

    // Only the backdated row remains.
    expect(screen.getByText(/1 event/)).toBeInTheDocument();
    expect(screen.queryByText("Mike Trout")).not.toBeInTheDocument();
    expect(screen.getByText("Backdated Guy")).toBeInTheDocument();
    // Trade summary should also be gone.
    expect(screen.queryByText(/Aces.*Beats/)).not.toBeInTheDocument();

    // aria-pressed reflects the toggle state.
    expect(chip.getAttribute("aria-pressed")).toBe("true");

    // Toggling off restores all 3.
    fireEvent.click(chip);
    expect(screen.getByText(/3 events/)).toBeInTheDocument();
    expect(screen.getByText("Mike Trout")).toBeInTheDocument();
  });

  it("filter chip starts unpressed and labels match the spec", () => {
    render(
      <ActivityHistoryTab
        completedTrades={[]}
        transactions={[BACKDATED_TX]}
      />,
    );

    const chip = screen.getByRole("button", { name: /Backdated only/i });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
  });
});
