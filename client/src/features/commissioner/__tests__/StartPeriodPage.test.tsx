import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mockToast = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: mockToast, confirm: vi.fn() }),
}));

vi.mock("../api", () => ({
  getLeaguePeriods: vi.fn(),
  getMovesSinceStart: vi.fn(),
  setPeriodStatus: vi.fn(),
}));

import * as api from "../api";
import StartPeriodPage from "../pages/StartPeriodPage";

const m = vi.mocked(api);

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/commissioner/:leagueId/start/:periodId" element={<StartPeriodPage />} />
        <Route path="/commissioner/:leagueId" element={<div>HUB PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const URL = "/commissioner/20/start/8";

function period(over: Partial<api.HubPeriod> = {}): api.HubPeriod {
  return { id: 8, name: "Period 8", startDate: "2026-09-29T00:00:00.000Z", endDate: "2026-10-12T00:00:00.000Z", status: "pending", ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T15:00:00.000Z"));
  m.getLeaguePeriods.mockResolvedValue([period()]);
  m.getMovesSinceStart.mockResolvedValue([]);
  m.setPeriodStatus.mockResolvedValue(period({ status: "active" }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StartPeriodPage", () => {
  it("shows the dates and a 'today' badge when the start date is today", async () => {
    renderAt(URL);
    expect(await screen.findByText("today")).toBeTruthy();
    expect(screen.getByText("No moves since the start date.")).toBeTruthy();
    expect(m.getLeaguePeriods).toHaveBeenCalledWith(20);
    expect(m.getMovesSinceStart).toHaveBeenCalledWith(20, 8);
  });

  it("pluralizes the late badge", async () => {
    vi.setSystemTime(new Date("2026-09-30T15:00:00.000Z"));
    const { unmount } = renderAt(URL);
    expect(await screen.findByText("1 day late")).toBeTruthy();
    unmount();
    vi.setSystemTime(new Date("2026-10-01T15:00:00.000Z"));
    renderAt(URL);
    expect(await screen.findByText("2 days late")).toBeTruthy();
  });

  it("lists moves made while pending with the player name", async () => {
    m.getMovesSinceStart.mockResolvedValue([
      { id: 1, teamName: "Devil Dawgs", playerName: "Webb", transactionType: "ADD", effDate: "2026-09-30T00:00:00.000Z" },
    ]);
    renderAt(URL);
    expect(await screen.findByText(/1 move made while pending/)).toBeTruthy();
    expect(screen.getByText(/Webb/)).toBeTruthy();
    const link = screen.getByText(/Webb/).closest("a");
    expect(link?.getAttribute("href")).toBe("/commissioner/20/rosters");
  });

  it("says already started when the period is not pending", async () => {
    m.getLeaguePeriods.mockResolvedValue([period({ status: "active" })]);
    renderAt(URL);
    expect(await screen.findByText(/This period has already started/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Start/ })).toBeNull();
    expect(m.setPeriodStatus).not.toHaveBeenCalled();
  });

  it("says no next period when the id is unknown", async () => {
    m.getLeaguePeriods.mockResolvedValue([period({ id: 99 })]);
    renderAt(URL);
    expect(await screen.findByText("No next period set up")).toBeTruthy();
    expect(screen.getByText(/Set up periods/).closest("a")?.getAttribute("href")).toBe("/commissioner/20/settings");
  });

  it("confirming calls setPeriodStatus(8, active) once, toasts, and goes to the hub", async () => {
    renderAt(URL);
    fireEvent.click(await screen.findByRole("button", { name: "Start Period 8" }));
    const sheet = await screen.findByRole("dialog");
    const confirmBtn = within(sheet).getByRole("button", { name: "Start period" });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(screen.getByText("HUB PAGE")).toBeTruthy());
    expect(m.setPeriodStatus).toHaveBeenCalledTimes(1);
    expect(m.setPeriodStatus).toHaveBeenCalledWith(8, { status: "active" });
    expect(mockToast).toHaveBeenCalledWith("Period 8 started", "success");
  });
});

describe("StartPeriodPage — another period still active", () => {
  it("shows a warning card linking to the active period's close job, and Start stays allowed", async () => {
    m.getLeaguePeriods.mockResolvedValue([
      period({ id: 7, name: "Period 7", startDate: "2026-09-15T00:00:00.000Z", endDate: "2026-09-28T00:00:00.000Z", status: "active" }),
      period(),
    ]);
    renderAt(URL);
    expect(
      await screen.findByText("Period 7 is still active — close it first so standings and moves land in the right period."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Close Period 7/ }).getAttribute("href")).toBe("/commissioner/20/close/7");
    const start = screen.getByRole("button", { name: "Start Period 8" }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
  });

  it("no warning when nothing else is active", async () => {
    renderAt(URL);
    await screen.findByRole("button", { name: "Start Period 8" });
    expect(screen.queryByText(/is still active/)).toBeNull();
  });
});
