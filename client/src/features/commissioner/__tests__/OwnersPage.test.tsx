import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const auth = vi.hoisted(() => ({ user: { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] } as any }));
vi.mock("../../../auth/AuthProvider", () => ({ useAuth: () => ({ me: { user: auth.user } }) }));

vi.mock("../api", () => ({
  getCommissionerOverview: vi.fn(),
  getInvites: vi.fn(),
  getLeagueInviteCode: vi.fn(),
  regenerateLeagueInviteCode: vi.fn(),
  assignTeamOwner: vi.fn(),
  removeTeamOwner: vi.fn(),
  cancelInvite: vi.fn(),
  inviteMember: vi.fn(),
  getAvailableUsers: vi.fn(),
}));

import * as api from "../api";
import OwnersPage from "../pages/OwnersPage";

const m = vi.mocked(api);
const u = (id: number, name: string | null) => ({ id, email: `u${id}@x.com`, name });

const OVERVIEW: any = {
  league: { id: 20, name: "OGBA", season: 2026 },
  teams: [
    { id: 1, name: "Aces", code: "ACE", ownerships: [{ id: 1, userId: 5, user: u(5, "Ann Lee") }] },
    { id: 2, name: "Bats", code: "BAT", ownerships: [] },
    { id: 3, name: "Cubs", code: "CUB", ownerships: [{ id: 2, userId: 5, user: u(5, "Ann Lee") }, { id: 3, userId: 6, user: u(6, null) }] },
  ],
  memberships: [
    { id: 1, userId: 5, role: "OWNER", user: u(5, "Ann Lee") },
    { id: 2, userId: 6, role: "OWNER", user: u(6, null) },
    { id: 3, userId: 7, role: "COMMISSIONER", user: u(7, "Cal Roe") },
  ],
};
const INVITES = [
  { id: 1, leagueId: 20, email: "pending@x.com", role: "OWNER", status: "PENDING", createdAt: "2026-03-02T12:00:00.000Z", expiresAt: "2026-04-01T12:00:00.000Z" },
  { id: 2, leagueId: 20, email: "done@x.com", role: "OWNER", status: "ACCEPTED", createdAt: "2026-03-01T12:00:00.000Z", expiresAt: "2026-04-01T12:00:00.000Z" },
  { id: 3, leagueId: 20, email: "gone@x.com", role: "OWNER", status: "CANCELLED", createdAt: "2026-03-01T12:00:00.000Z", expiresAt: "2026-04-01T12:00:00.000Z" },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/commissioner/20/owners"]}>
      <Routes>
        <Route path="/commissioner/:leagueId/owners" element={<OwnersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { isAdmin: false, memberships: [{ leagueId: "20", role: "COMMISSIONER" }] };
  m.getCommissionerOverview.mockResolvedValue(JSON.parse(JSON.stringify(OVERVIEW)));
  m.getInvites.mockResolvedValue(INVITES as any);
  m.getLeagueInviteCode.mockResolvedValue("ABC123");
  m.regenerateLeagueInviteCode.mockResolvedValue("NEW999");
  m.assignTeamOwner.mockResolvedValue(undefined);
  m.removeTeamOwner.mockResolvedValue(undefined);
  m.cancelInvite.mockResolvedValue(undefined);
  m.inviteMember.mockResolvedValue({ status: "invited" } as any);
});

describe("OwnersPage", () => {
  it("non-commissioners see only the notice", () => {
    auth.user = { isAdmin: false, memberships: [{ leagueId: "20", role: "OWNER" }] };
    renderPage();
    expect(screen.getByText("Commissioners only.")).toBeTruthy();
    expect(m.getCommissionerOverview).not.toHaveBeenCalled();
  });

  it("shows owners, Joined, and No owner for a team without one", async () => {
    renderPage();
    const bats = (await screen.findByText("Bats")).closest("[data-testid='team-row']") as HTMLElement;
    expect(within(bats).getByText("No owner")).toBeTruthy();
    const aces = screen.getByText("Aces").closest("[data-testid='team-row']") as HTMLElement;
    expect(within(aces).getByText("Ann Lee")).toBeTruthy();
    expect(within(aces).getByText("Joined")).toBeTruthy();
    const cubs = screen.getByText("Cubs").closest("[data-testid='team-row']") as HTMLElement;
    expect(within(cubs).getByText(/u6@x\.com/)).toBeTruthy();
  });

  it("copies the full join URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPage();
    const url = `${window.location.origin}/join/ABC123`;
    expect(await screen.findByText(url)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
  });

  it("regenerate needs the sheet confirmed, then POSTs", async () => {
    renderPage();
    await screen.findByText(`${window.location.origin}/join/ABC123`);
    fireEvent.click(screen.getByRole("button", { name: "New link" }));
    expect(screen.getByText("Make a new invite link?")).toBeTruthy();
    expect(screen.getByText("The old link stops working.")).toBeTruthy();
    expect(m.regenerateLeagueInviteCode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Make new link" }));
    await waitFor(() => expect(m.regenerateLeagueInviteCode).toHaveBeenCalledWith(20));
    expect(await screen.findByText(`${window.location.origin}/join/NEW999`)).toBeTruthy();
  });

  it("add-owner picker lists league members only and never calls available-users", async () => {
    renderPage();
    const bats = (await screen.findByText("Bats")).closest("[data-testid='team-row']") as HTMLElement;
    fireEvent.click(within(bats).getByRole("button", { name: /Manage/ }));
    const select = within(bats).getByLabelText("Add owner") as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual(expect.arrayContaining(["Ann Lee", "u6@x.com", "Cal Roe"]));
    expect(labels.filter((l) => l && l !== "Choose a member")).toHaveLength(3);
    expect(m.getAvailableUsers).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: "7" } });
    fireEvent.click(within(bats).getByRole("button", { name: "Add owner" }));
    await waitFor(() => expect(m.assignTeamOwner).toHaveBeenCalledWith(20, 2, 7));
  });

  it("hides Add owner when the team already has 2 owners", async () => {
    renderPage();
    const cubs = (await screen.findByText("Cubs")).closest("[data-testid='team-row']") as HTMLElement;
    fireEvent.click(within(cubs).getByRole("button", { name: /Manage/ }));
    expect(within(cubs).queryByLabelText("Add owner")).toBeNull();
  });

  it("removing an owner goes through the sheet, then DELETEs with the right ids", async () => {
    renderPage();
    const aces = (await screen.findByText("Aces")).closest("[data-testid='team-row']") as HTMLElement;
    fireEvent.click(within(aces).getByRole("button", { name: /Manage/ }));
    fireEvent.click(within(aces).getByRole("button", { name: "Remove Ann Lee" }));
    expect(m.removeTeamOwner).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove owner" }));
    await waitFor(() => expect(m.removeTeamOwner).toHaveBeenCalledWith(20, 1, 5));
  });

  it("lists pending invites only, and cancel goes through the sheet", async () => {
    renderPage();
    expect(await screen.findByText("pending@x.com")).toBeTruthy();
    expect(screen.queryByText("done@x.com")).toBeNull();
    expect(screen.queryByText("gone@x.com")).toBeNull();
    expect(screen.getByText("Invited Mar 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel invite for pending@x.com" }));
    expect(m.cancelInvite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel invite" }));
    await waitFor(() => expect(m.cancelInvite).toHaveBeenCalledWith(20, 1));
  });

  it("add someone POSTs email and role", async () => {
    renderPage();
    await screen.findByText("Bats");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@x.com" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "COMMISSIONER" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(m.inviteMember).toHaveBeenCalledWith(20, "new@x.com", "COMMISSIONER"));
    expect(await screen.findByText("Invite sent to new@x.com.")).toBeTruthy();
  });
});
