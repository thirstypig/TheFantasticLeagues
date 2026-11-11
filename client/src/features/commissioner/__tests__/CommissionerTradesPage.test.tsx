import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mockToast = vi.fn();
vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { user: { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] } } }),
}));
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: mockToast, confirm: vi.fn() }),
}));
vi.mock("../api", () => ({
  getCommissionerOverview: vi.fn(),
  getCommissionerRosters: vi.fn(),
  getRosterCheck: vi.fn(),
  getLeaguePeriods: vi.fn(),
  getCommissionerRules: vi.fn(),
  listLeagueTrades: vi.fn(),
  processLeagueTrade: vi.fn(),
  vetoLeagueTrade: vi.fn(),
  reverseLeagueTrade: vi.fn(),
}));

import * as api from "../api";
import CommissionerTradesPage from "../pages/CommissionerTradesPage";

const m = vi.mocked(api);
const T = (id: number, name: string) => ({ id, name });

function renderPage(strict = false) {
  const Wrap = strict ? React.StrictMode : React.Fragment;
  return render(
    <Wrap><MemoryRouter initialEntries={["/commissioner/20/trades"]}>
      <Routes>
        <Route path="/commissioner/:leagueId/trades" element={<CommissionerTradesPage />} />
        <Route path="/commissioner/:leagueId/trade-record" element={<div>RECORD STUB</div>} />
        <Route path="/commissioner/:leagueId" element={<div>HUB STUB</div>} />
      </Routes>
    </MemoryRouter></Wrap>,
  );
}

const accepted = {
  id: 1, status: "ACCEPTED", createdAt: "2026-11-02T12:00:00.000Z", processedAt: null, proposerId: 2, proposer: T(2, "Bombers"),
  items: [
    { senderId: 2, recipientId: 4, assetType: "PLAYER", playerId: 101, amount: null, player: { ...T(101, "Paul Skenes"), posPrimary: "SP", mlbTeam: "PIT" }, sender: T(2, "Bombers"), recipient: T(4, "Los Doyers") },
    { senderId: 4, recipientId: 2, assetType: "PLAYER", playerId: 401, amount: null, player: T(401, "Mookie Betts"), sender: T(4, "Los Doyers"), recipient: T(2, "Bombers") },
    { senderId: 4, recipientId: 2, assetType: "BUDGET", playerId: null, amount: 5, player: null, sender: T(4, "Los Doyers"), recipient: T(2, "Bombers") },
  ],
};
const proposed = {
  id: 2, status: "PROPOSED", createdAt: "2026-11-03T12:00:00.000Z", processedAt: null, proposerId: 4, proposer: T(4, "Los Doyers"),
  items: [{ senderId: 4, recipientId: 6, assetType: "PLAYER", playerId: 202, amount: null, player: T(202, "Bo Bichette"), sender: T(4, "Los Doyers"), recipient: T(6, "Skunk Dogs") }],
};
const processed = {
  id: 3, status: "PROCESSED", createdAt: "2026-10-01T12:00:00.000Z", processedAt: "2026-10-05T12:00:00.000Z", proposerId: 2, proposer: T(2, "Bombers"),
  items: [{ senderId: 2, recipientId: 6, assetType: "PLAYER", playerId: 303, amount: null, player: T(303, "Old Guy"), sender: T(2, "Bombers"), recipient: T(6, "Skunk Dogs") }],
};

const PENDING = { id: 9, name: "Period 9", startDate: "2026-12-07T12:00:00.000Z", endDate: "2026-12-20T12:00:00.000Z", status: "pending" };
const ACTIVE = { id: 8, name: "Period 8", startDate: "2026-11-01T12:00:00.000Z", endDate: "2026-12-06T12:00:00.000Z", status: "active" };
const DONE = { id: 7, name: "Period 7", startDate: "2026-10-01T12:00:00.000Z", endDate: "2026-10-31T12:00:00.000Z", status: "completed" };

const ros = (teamId: number, playerId: number, pos: string | null = "OF") => ({ id: playerId, teamId, assignedPosition: pos, acquiredAt: "x", player: { id: playerId, name: "P", posPrimary: "OF" }, price: 1 });

beforeEach(() => {
  vi.clearAllMocks();
  m.getCommissionerOverview.mockResolvedValue({ league: { id: 20 }, teams: [{ id: 2, name: "Bombers" }, { id: 4, name: "Los Doyers" }, { id: 6, name: "Skunk Dogs" }] } as any);
  m.getCommissionerRosters.mockResolvedValue([ros(2, 101), ros(4, 401)] as any);
  m.getRosterCheck.mockResolvedValue({ cap: 23, teams: [{ teamId: 2, teamName: "Bombers", activeCount: 23, over: false }, { teamId: 4, teamName: "Los Doyers", activeCount: 23, over: false }] });
  m.getLeaguePeriods.mockResolvedValue([DONE, PENDING] as any);
  m.getCommissionerRules.mockResolvedValue([{ id: 1, category: "trades", key: "trade_window", value: "meeting_day", label: "", isLocked: false }]);
  m.listLeagueTrades.mockResolvedValue([accepted, proposed, processed] as any);
  m.processLeagueTrade.mockResolvedValue(undefined);
  m.vetoLeagueTrade.mockResolvedValue(undefined);
  m.reverseLeagueTrade.mockResolvedValue(undefined);
});

describe("CommissionerTradesPage", () => {
  it("shows the rule line, sections, assets and roster check", async () => {
    renderPage();
    await screen.findByText("To process · 1");
    expect(screen.getByText(/Rule: meeting day only · every trade waits for you/)).toBeInTheDocument();
    expect(screen.getByText("Bombers ↔ Los Doyers")).toBeInTheDocument();
    expect(screen.getByText("Paul Skenes → Los Doyers")).toBeInTheDocument();
    expect(screen.getByText("Mookie Betts → Bombers")).toBeInTheDocument();
    expect(screen.getByText("$5 → Bombers")).toBeInTheDocument();
    expect(screen.getByText("Both rosters stay at 23")).toBeInTheDocument();
    expect(screen.getByText("offered Nov 2")).toBeInTheDocument();
    expect(screen.queryByText(/accepted/)).toBeNull();
    expect(screen.getByText("SP · PIT")).toBeInTheDocument();
    expect(screen.getByText("✓")).toBeInTheDocument();
    expect(screen.getByText("Still being discussed")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    expect(screen.getByText("Processed this season")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Record a past trade/ })).toHaveAttribute("href", "/commissioner/20/trade-record");
  });

  it("a proposed trade has only a Veto button", async () => {
    renderPage();
    await screen.findByText("Still being discussed");
    const card = screen.getByText("Los Doyers → Skunk Dogs").closest("[data-testid='trade-card']") as HTMLElement;
    const buttons = within(card).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent("Veto");
  });

  it("veto on a proposed offer confirms, then calls the veto endpoint", async () => {
    renderPage();
    await screen.findByText("Still being discussed");
    const card = screen.getByText("Los Doyers → Skunk Dogs").closest("[data-testid='trade-card']") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Veto" }));
    expect(await screen.findByText("Veto this offer?")).toBeInTheDocument();
    expect(screen.getByText("Both teams are told.")).toBeInTheDocument();
    expect(m.vetoLeagueTrade).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Veto offer" }));
    await waitFor(() => expect(m.vetoLeagueTrade).toHaveBeenCalledWith(2));
    expect(mockToast).toHaveBeenCalledWith("Offer vetoed", "success");
    await waitFor(() => expect(m.listLeagueTrades).toHaveBeenCalledTimes(2));
  });

  it("a player who left the sender shows a bad line and no green check", async () => {
    // Skenes is on no Bombers row at all (not active, not IL).
    m.getCommissionerRosters.mockResolvedValue([ros(4, 401)] as any);
    renderPage();
    await screen.findByText("To process · 1");
    expect(screen.getByText("Paul Skenes is no longer on Bombers")).toBeInTheDocument();
    expect(screen.queryByText("✓")).toBeNull();
    expect(screen.queryByText(/Both rosters stay/)).toBeNull();
  });

  it("process sends the pending period start date between periods", async () => {
    renderPage();
    await screen.findByText("To process · 1");
    fireEvent.click(screen.getByRole("button", { name: "Process" }));
    expect(await screen.findByText("Process, dated Mon Dec 7?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Process trade" }));
    await waitFor(() => expect(m.processLeagueTrade).toHaveBeenCalledWith(1, "2026-12-07"));
    await waitFor(() => expect(m.listLeagueTrades).toHaveBeenCalledTimes(2));
  });

  it("process sends no date during an active period", async () => {
    m.getLeaguePeriods.mockResolvedValue([DONE, ACTIVE, PENDING] as any);
    renderPage();
    await screen.findByText("To process · 1");
    fireEvent.click(screen.getByRole("button", { name: "Process" }));
    expect(await screen.findByText("Process, effective tomorrow?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Process trade" }));
    await waitFor(() => expect(m.processLeagueTrade).toHaveBeenCalledWith(1, undefined));
  });

  it("veto calls the veto endpoint", async () => {
    renderPage();
    await screen.findByText("To process · 1");
    const card = screen.getByText("Bombers ↔ Los Doyers").closest("[data-testid='trade-card']") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Veto" }));
    fireEvent.click(await screen.findByRole("button", { name: "Veto trade" }));
    await waitFor(() => expect(m.vetoLeagueTrade).toHaveBeenCalledWith(1));
  });

  it("reverse calls reverse with no date", async () => {
    renderPage();
    await screen.findByText("Processed this season");
    expect(screen.getByText(/1 player/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reverse" }));
    expect(await screen.findByText("Reverse this trade?")).toBeInTheDocument();
    expect(screen.getByText("Players and dollars go back to their old teams.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reverse trade" }));
    await waitFor(() => expect(m.reverseLeagueTrade).toHaveBeenCalledWith(3));
    expect(m.reverseLeagueTrade.mock.calls[0]).toHaveLength(1);
  });

  it("reloads after a 400 and shows the error verbatim on the card", async () => {
    m.processLeagueTrade.mockRejectedValue(new Error("Trade is not in ACCEPTED status"));
    renderPage();
    await screen.findByText("To process · 1");
    fireEvent.click(screen.getByRole("button", { name: "Process" }));
    fireEvent.click(await screen.findByRole("button", { name: "Process trade" }));
    expect(await screen.findByText("Trade is not in ACCEPTED status")).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith("Trade is not in ACCEPTED status", "error");
    await waitFor(() => expect(m.listLeagueTrades).toHaveBeenCalledTimes(2));
  });

  it("sends no date at the close step (period still active, past its end)", async () => {
    const CLOSING = { ...ACTIVE, startDate: "2019-01-01T12:00:00.000Z", endDate: "2020-01-01T12:00:00.000Z" };
    m.getLeaguePeriods.mockResolvedValue([DONE, CLOSING, PENDING] as any);
    renderPage();
    await screen.findByText("To process · 1");
    fireEvent.click(screen.getByRole("button", { name: "Process" }));
    expect(await screen.findByText("Process, effective tomorrow?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Process trade" }));
    await waitFor(() => expect(m.processLeagueTrade).toHaveBeenCalledWith(1, undefined));
  });

  it("an IL player does not change active counts (team at cap stays fine)", async () => {
    m.getCommissionerRosters.mockResolvedValue([ros(2, 101, "IL"), ros(4, 401)] as any);
    m.listLeagueTrades.mockResolvedValue([{ ...accepted, items: [accepted.items[0], accepted.items[2]] }] as any);
    renderPage();
    expect(await screen.findByText("Both rosters stay at 23")).toBeInTheDocument();
    expect(screen.queryByText(/would have/)).toBeNull();
  });

  it("omits the rule half of the header when rules fail to load", async () => {
    m.getCommissionerRules.mockRejectedValue(new Error("boom"));
    renderPage();
    await screen.findByText("To process · 1");
    expect(screen.queryByText(/Rule:/)).toBeNull();
    expect(screen.getByText("Every trade waits for you")).toBeInTheDocument();
  });

  it("flags a team that would end over the cap", async () => {
    m.listLeagueTrades.mockResolvedValue([{ ...accepted, items: [accepted.items[0], accepted.items[2]] }] as any);
    m.getRosterCheck.mockResolvedValue({ cap: 23, teams: [{ teamId: 2, teamName: "Bombers", activeCount: 22, over: false }, { teamId: 4, teamName: "Los Doyers", activeCount: 23, over: false }] });
    renderPage();
    expect(await screen.findByText("Los Doyers would have 24 players (limit 23)")).toBeInTheDocument();
    expect(screen.getByText("Bombers goes to 21 and fills the spot at the meeting")).toBeInTheDocument();
  });

  it("works under StrictMode", async () => {
    renderPage(true);
    expect(await screen.findByText("To process · 1")).toBeInTheDocument();
  });
});
