import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ApiError } from "../../../api/base";

const mockToast = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: mockToast, confirm: vi.fn() }),
}));

vi.mock("../api", () => ({
  getLeaguePeriods: vi.fn(),
  getUnbilledPeriods: vi.fn(),
  getRosterCheck: vi.fn(),
  previewIlFees: vi.fn(),
  billIlFees: vi.fn(),
}));

import * as api from "../api";
import BillPeriodPage from "../pages/BillPeriodPage";

const m = vi.mocked(api);

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        {/* Mirrors App.tsx: the literal bill route sits above the :section catch. */}
        <Route path="/commissioner/:leagueId/bill/:periodId" element={<BillPeriodPage />} />
        <Route path="/commissioner/:leagueId/:section" element={<div>SECTION PAGE</div>} />
        <Route path="/commissioner/:leagueId" element={<div>HUB PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const BILL_URL = "/commissioner/20/bill/6";

beforeEach(() => {
  vi.clearAllMocks();
  m.getLeaguePeriods.mockResolvedValue([
    { id: 6, name: "Period 6", startDate: "2026-08-01T00:00:00.000Z", endDate: "2026-08-14T00:00:00.000Z", status: "completed" },
  ]);
  m.getUnbilledPeriods.mockResolvedValue([{ periodId: 6, closedAt: "2026-08-15T15:00:00.000Z" }]);
  m.getRosterCheck.mockResolvedValue({
    cap: 23,
    teams: [
      { teamId: 1, teamName: "Demolition Lumber", activeCount: 23, over: false },
      { teamId: 2, teamName: "Devil Dawgs", activeCount: 23, over: false },
    ],
  });
  m.previewIlFees.mockResolvedValue({
    leagueId: 20,
    periodId: 6,
    added: 2,
    voided: 0,
    unchanged: 0,
    dryRun: true,
    preview: [
      { action: "add", teamId: 2, playerId: 101, playerName: "Webb", rank: 1, amount: 10 },
      { action: "add", teamId: 1, playerId: 105, playerName: "Kim", rank: 2, amount: 20 },
    ],
  });
  m.billIlFees.mockResolvedValue({ leagueId: 20, periodId: 6, added: 2, voided: 0, unchanged: 0, dryRun: false });
});

describe("BillPeriodPage", () => {
  it("is routed at /commissioner/:leagueId/bill/:periodId, declared above the :section catch in App.tsx", async () => {
    renderAt(BILL_URL);
    expect(await screen.findByRole("heading", { name: "Bill IL fees · Period 6" })).toBeTruthy();
    expect(m.getUnbilledPeriods).toHaveBeenCalledWith(20);

    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const bill = app.indexOf('path="/commissioner/:leagueId/bill/:periodId"');
    const section = app.indexOf('path="/commissioner/:leagueId/:section"');
    expect(bill).toBeGreaterThan(-1);
    expect(bill).toBeLessThan(section);
  });

  it("shows the dry-run preview per team with names and the total", async () => {
    renderAt(BILL_URL);
    expect(await screen.findByText("This would bill $30")).toBeTruthy();
    expect(m.previewIlFees).toHaveBeenCalledWith(20, 6);
    expect(within(screen.getByTestId("fee-team-1")).getByText("Demolition Lumber")).toBeTruthy();
    expect(within(screen.getByTestId("fee-team-1")).getByText("$20")).toBeTruthy();
    expect(within(screen.getByTestId("fee-team-2")).getByText("Devil Dawgs")).toBeTruthy();
    expect(m.billIlFees).not.toHaveBeenCalled();
  });

  it("confirm sheet names the amount; confirming calls billIlFees(20, 6) exactly once, toasts, returns to the hub", async () => {
    let resolveBill: (v: any) => void = () => {};
    m.billIlFees.mockReturnValue(new Promise((r) => { resolveBill = r; }));
    renderAt(BILL_URL);
    fireEvent.click(await screen.findByRole("button", { name: "Bill $30" }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Bill IL fees for Period 6?")).toBeTruthy();
    expect(within(sheet).getByText("$30 in IL fees are billed. You can't undo this.")).toBeTruthy();

    const confirm = within(sheet).getByRole("button", { name: "Bill IL fees" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    resolveBill({ leagueId: 20, periodId: 6, added: 2, voided: 0, unchanged: 0, dryRun: false });

    expect(await screen.findByText("HUB PAGE")).toBeTruthy();
    expect(m.billIlFees).toHaveBeenCalledTimes(1);
    expect(m.billIlFees).toHaveBeenCalledWith(20, 6);
    expect(mockToast).toHaveBeenCalledWith("Period 6 billed", "success");
  });

  it("a 429 cooldown shows the inline cooling-down message and stays on the page", async () => {
    m.billIlFees.mockRejectedValue(
      new ApiError({ message: "cooling down", status: 429, url: "/x", requestId: null, body: null }),
    );
    renderAt(BILL_URL);
    fireEvent.click(await screen.findByRole("button", { name: "Bill $30" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Bill IL fees" }));

    expect(await screen.findByText("Billing is cooling down — try again in a minute.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("HUB PAGE")).toBeNull();
    expect(mockToast).not.toHaveBeenCalledWith("Period 6 billed", "success");
  });

  it("a period that is no longer deferred shows Already billed with a link back, and no bill button", async () => {
    m.getUnbilledPeriods.mockResolvedValue([]);
    renderAt(BILL_URL);
    expect(await screen.findByText("Already billed")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Commissioner" }).getAttribute("href")).toBe("/commissioner/20");
    expect(screen.queryByRole("button", { name: /^Bill/ })).toBeNull();
    expect(m.previewIlFees).not.toHaveBeenCalled();
  });

  it("falls back to 'period <id>' when the period name can't be loaded", async () => {
    m.getLeaguePeriods.mockRejectedValue(new Error("boom"));
    renderAt(BILL_URL);
    expect(await screen.findByRole("heading", { name: "Bill IL fees · period 6" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("This would bill $30")).toBeTruthy());
  });
});
