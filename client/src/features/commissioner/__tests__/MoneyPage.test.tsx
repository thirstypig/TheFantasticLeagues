import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mockToast = vi.fn();
const auth = vi.hoisted(() => ({ user: { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] } as any }));
vi.mock("../../../auth/AuthProvider", () => ({ useAuth: () => ({ me: { user: auth.user } }) }));
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: mockToast, confirm: vi.fn() }),
}));
vi.mock("../api", () => ({
  getCommissionerOverview: vi.fn(),
  getLeagueBalances: vi.fn(),
  getUnbilledPeriods: vi.fn(),
  getLeaguePeriods: vi.fn(),
  updateLeague: vi.fn(),
}));

import * as api from "../api";
import MoneyPage from "../pages/MoneyPage";

const m = vi.mocked(api);

const teams = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `T${i + 1}` }));

function overview(entryFee: number | null, n = 8, entryFeeNote: string | null = null) {
  return { league: { id: 20, name: "OGBA", season: 2026, entryFee, entryFeeNote }, teams: teams(n) } as any;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/commissioner/20/money"]}>
      <Routes>
        <Route path="/commissioner/:leagueId/money" element={<MoneyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] };
  m.getCommissionerOverview.mockResolvedValue(overview(200));
  m.getLeagueBalances.mockResolvedValue([
    { teamId: 1, teamName: "Paid Team", balance: 0 },
    { teamId: 2, teamName: "Owes Little", balance: 25 },
    { teamId: 3, teamName: "Has Credit", balance: -10 },
    { teamId: 4, teamName: "Owes More", balance: 50 },
  ]);
  m.getUnbilledPeriods.mockResolvedValue([]);
  m.getLeaguePeriods.mockResolvedValue([
    { id: 7, name: "Period 7", startDate: "", endDate: "", status: "completed" },
    { id: 8, name: "Period 8", startDate: "", endDate: "", status: "completed" },
  ]);
});

describe("MoneyPage", () => {
  it("labels balances honestly and sorts by balance descending", async () => {
    renderPage();
    await screen.findByText("Owes More");
    expect(screen.getByText("Owes $50")).toBeTruthy();
    expect(screen.getByText("Owes $25")).toBeTruthy();
    expect(screen.getByText("Paid up")).toBeTruthy();
    expect(screen.getByText("Credit $10")).toBeTruthy();
    const names = screen.getAllByTestId("team-name").map((n) => n.textContent);
    expect(names).toEqual(["Owes More", "Owes Little", "Paid Team", "Has Credit"]);
  });

  it("sums positive balances only for Owed", async () => {
    renderPage();
    await screen.findByText("Owes More");
    expect(screen.getByTestId("owed-total").textContent).toBe("$75");
    expect(screen.getByText("by 2 teams")).toBeTruthy();
  });

  it("computes the prize pool as entry fee times team count", async () => {
    m.getCommissionerOverview.mockResolvedValue(overview(200, 8));
    renderPage();
    expect((await screen.findByTestId("prize-pool")).textContent).toBe("$1,600");
    expect(screen.getByText("8 × $200")).toBeTruthy();
  });

  it("shows a bill button per unbilled period linking to the bill page", async () => {
    m.getUnbilledPeriods.mockResolvedValue([
      { periodId: 7, closedAt: "2026-06-01T00:00:00Z" },
      { periodId: 8, closedAt: "2026-06-15T00:00:00Z" },
    ]);
    renderPage();
    const a = await screen.findByRole("link", { name: "Bill IL fees for Period 7" });
    expect(a.getAttribute("href")).toBe("/commissioner/20/bill/7");
    expect(screen.getByRole("link", { name: "Bill IL fees for Period 8" }).getAttribute("href")).toBe("/commissioner/20/bill/8");
  });

  it("hides the bill button when nothing is unbilled", async () => {
    renderPage();
    await screen.findByText("Owes More");
    expect(screen.queryByText(/Bill IL fees/)).toBeNull();
  });

  it("links to payouts", async () => {
    renderPage();
    const a = await screen.findByRole("link", { name: "Payouts ›" });
    expect(a.getAttribute("href")).toBe("/payouts");
  });

  it("PATCHes the exact entry fee body", async () => {
    m.getCommissionerOverview.mockResolvedValue(overview(200, 8, "Due Apr 1"));
    m.updateLeague.mockResolvedValue({ league: {} } as any);
    renderPage();
    await screen.findByText("Entry fee $200 per team");
    fireEvent.click(screen.getByRole("button", { name: "Edit entry fee" }));
    fireEvent.change(screen.getByLabelText("Entry fee ($)"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Due May 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.updateLeague).toHaveBeenCalledWith(20, { entryFee: 250, entryFeeNote: "Due May 1" }));
    expect(await screen.findByText("Entry fee $250 per team")).toBeTruthy();
    expect(screen.getByTestId("prize-pool").textContent).toBe("$2,000");
  });

  it("shows 'Entry fee not set' with no prize pool when the fee is null", async () => {
    m.getCommissionerOverview.mockResolvedValue(overview(null));
    renderPage();
    await screen.findByText("Entry fee not set");
    expect(screen.queryByTestId("prize-pool")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit entry fee" })).toBeTruthy();
  });

  it("never renders coming-soon or ledger placeholders", async () => {
    renderPage();
    await screen.findByText("Owes More");
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.queryByText(/ledger/i)).toBeNull();
    expect(screen.getByRole("link", { name: "‹ Commissioner" }).getAttribute("href")).toBe("/commissioner/20");
  });

  it("renders only 'Commissioners only.' for a non-commissioner", async () => {
    auth.user = { isAdmin: false, memberships: [{ leagueId: "20", role: "OWNER" }] };
    renderPage();
    expect(await screen.findByText("Commissioners only.")).toBeTruthy();
    expect(m.getLeagueBalances).not.toHaveBeenCalled();
  });
});
