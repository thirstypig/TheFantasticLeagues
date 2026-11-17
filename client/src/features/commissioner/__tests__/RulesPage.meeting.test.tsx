import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { user: { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] } } }),
}));
const refreshLeagueRules = vi.hoisted(() => vi.fn());
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 20, seasonStatus: "IN_SEASON", refreshLeagueRules }),
}));
vi.mock("../api", () => ({
  getCommissionerRules: vi.fn(),
  saveCommissionerRules: vi.fn(),
  getLockedFields: vi.fn(),
}));

import * as api from "../api";
import RulesPage from "../pages/RulesPage";

const m = vi.mocked(api);
const row = (id: number, key: string, value: string, label: string) => ({ id, category: "meeting", key, value, label, isLocked: false });

function meetingRows(live: string) {
  return [
    row(101, "live", live, "Owners enter own moves at the meeting"),
    row(102, "turn_seconds", "120", "Clock per turn"),
    row(103, "can_add_time", "true", "You can add time"),
    row(104, "overtime_fee", "0", "Penalty for going over"),
  ];
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/commissioner/20/rules"]}>
      <Routes><Route path="/commissioner/:leagueId/rules" element={<RulesPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.saveCommissionerRules.mockResolvedValue(undefined);
});

describe("RulesPage Meeting group", () => {
  it("with live off, shows only the live switch and its sub-line", async () => {
    m.getCommissionerRules.mockResolvedValue(meetingRows("false"));
    renderPage();
    expect(await screen.findByRole("switch", { name: "Owners enter own moves at the meeting" })).toBeTruthy();
    expect(screen.getByText("You enter them for everyone")).toBeTruthy();
    expect(screen.queryByText("Clock per turn")).toBeNull();
    expect(screen.queryByText("You can add time")).toBeNull();
    expect(screen.queryByText("Penalty for going over")).toBeNull();
  });

  it("toggling live saves 'true'", async () => {
    m.getCommissionerRules.mockResolvedValue(meetingRows("false"));
    renderPage();
    fireEvent.click(await screen.findByRole("switch", { name: "Owners enter own moves at the meeting" }));
    await waitFor(() => expect(m.saveCommissionerRules).toHaveBeenCalledWith(20, [{ id: 101, value: "true" }]));
  });

  it("a successful save refreshes the app-wide league rules", async () => {
    m.getCommissionerRules.mockResolvedValue(meetingRows("false"));
    renderPage();
    fireEvent.click(await screen.findByRole("switch", { name: "Owners enter own moves at the meeting" }));
    await waitFor(() => expect(refreshLeagueRules).toHaveBeenCalledTimes(1));
  });

  it("a failed save does not refresh the league rules", async () => {
    m.saveCommissionerRules.mockRejectedValue(new Error("nope"));
    m.getCommissionerRules.mockResolvedValue(meetingRows("false"));
    renderPage();
    fireEvent.click(await screen.findByRole("switch", { name: "Owners enter own moves at the meeting" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(refreshLeagueRules).not.toHaveBeenCalled();
  });

  it("the fee row says a fee can't be undone yet", async () => {
    m.getCommissionerRules.mockResolvedValue(meetingRows("true"));
    renderPage();
    expect(await screen.findByText("You can void a fee on the Money page.")).toBeTruthy();
  });

  it("with live on, shows all four rows and '3 min' saves 180", async () => {
    m.getCommissionerRules.mockResolvedValue(meetingRows("true"));
    renderPage();
    expect(await screen.findByText("Clock per turn")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "You can add time" })).toBeTruthy();
    expect(screen.getByText("Penalty for going over")).toBeTruthy();
    expect(screen.queryByText("You enter them for everyone")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "3 min" }));
    await waitFor(() => expect(m.saveCommissionerRules).toHaveBeenCalledWith(20, [{ id: 102, value: "180" }]));
  });

  it("the fee segmented offers Off / $1 / $5", async () => {
    m.getCommissionerRules.mockResolvedValue(meetingRows("true"));
    renderPage();
    await screen.findByText("Penalty for going over");
    fireEvent.click(screen.getByRole("button", { name: "$5" }));
    await waitFor(() => expect(m.saveCommissionerRules).toHaveBeenCalledWith(20, [{ id: 104, value: "5" }]));
  });
});
