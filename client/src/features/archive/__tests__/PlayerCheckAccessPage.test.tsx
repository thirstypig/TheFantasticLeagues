import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuditAccessListResponseSchema } from "@shared/api/archivePlayerCheck";

vi.mock("../playerCheckApi", () => ({ listAuditAccess: vi.fn(), setAuditAccess: vi.fn() }));

import { ApiError } from "../../../api/base";
import PlayerCheckAccessPage from "../pages/PlayerCheckAccessPage";
import * as api from "../playerCheckApi";

const m = vi.mocked(api);

// Wire-shaped: parsed by the shared schema so the fixture can't drift from the API.
const members = AuditAccessListResponseSchema.parse({
  members: [
    { membershipId: 40, name: "Pat Rivera", role: "COMMISSIONER", teamCodes: ["DMK"], teamNames: ["Diamond Kings"], access: "NONE" },
    { membershipId: 41, name: "Sam Ortiz", role: "OWNER", teamCodes: ["DDG"], teamNames: ["Dodger Dawgs"], access: "OWN_TEAM" },
    { membershipId: 42, name: "Lee Moreno", role: "OWNER", teamCodes: [], teamNames: [], access: "NONE" },
  ],
}).members;

const apiError = (status: number, serverMessage: string | null = null) =>
  new ApiError({ message: serverMessage ?? `HTTP ${status}`, status, url: "/api/archive/audit-access", requestId: null, body: null, serverMessage });

const renderPage = () => render(<MemoryRouter><PlayerCheckAccessPage /></MemoryRouter>);
const row = (name: string) => screen.getByText(new RegExp(`^${name}`)).closest("li")!;
const choice = (name: string, label: string) => within(row(name)).getByRole("radio", { name: label });

beforeEach(() => {
  vi.clearAllMocks();
  m.listAuditAccess.mockResolvedValue(members);
  m.setAuditAccess.mockResolvedValue(undefined);
});

describe("who can help", () => {
  it("lists each member with his current access checked and what it lets him do", async () => {
    renderPage();
    await screen.findByText(/^Pat Rivera/);
    expect(screen.getByText("Pat Rivera · commissioner")).toBeTruthy();
    expect(choice("Pat Rivera", "Off").getAttribute("aria-checked")).toBe("true");
    expect(choice("Sam Ortiz", "Own team").getAttribute("aria-checked")).toBe("true");
    expect(within(row("Sam Ortiz")).getByText("Team: Dodger Dawgs")).toBeTruthy();
    expect(within(row("Lee Moreno")).getByText("Owns no team")).toBeTruthy();
  });

  it("saves a choice as soon as it's tapped and says so", async () => {
    renderPage();
    await screen.findByText(/^Pat Rivera/);
    fireEvent.click(choice("Pat Rivera", "All teams"));
    expect(m.setAuditAccess).toHaveBeenCalledWith(40, "ALL");
    await waitFor(() => expect(within(row("Pat Rivera")).getByText("Saved ✓ Pat's decisions are now final and can replace owners'.")).toBeTruthy());
    expect(choice("Pat Rivera", "All teams").getAttribute("aria-checked")).toBe("true");
    expect(choice("Pat Rivera", "Off").getAttribute("aria-checked")).toBe("false");
  });

  it("does nothing when the current choice is tapped again", async () => {
    renderPage();
    await screen.findByText(/^Sam Ortiz/);
    fireEvent.click(choice("Sam Ortiz", "Own team"));
    expect(m.setAuditAccess).not.toHaveBeenCalled();
  });

  it("keeps the old choice and shows why when saving fails", async () => {
    m.setAuditAccess.mockRejectedValue(apiError(404, "No such member."));
    renderPage();
    await screen.findByText(/^Sam Ortiz/);
    fireEvent.click(choice("Sam Ortiz", "Off"));
    await waitFor(() => expect(within(row("Sam Ortiz")).getByText("No such member.")).toBeTruthy());
    expect(choice("Sam Ortiz", "Own team").getAttribute("aria-checked")).toBe("true");
  });

  it("tells a non-admin he can't choose, without listing anyone", async () => {
    m.listAuditAccess.mockRejectedValue(apiError(403, "Admin only"));
    renderPage();
    expect(await screen.findByText("Only a site admin can choose who helps.")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
  });
});
