import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { user: { isAdmin: true, memberships: [] } } }),
}));
const fetchSpy = vi.hoisted(() => vi.fn());
vi.mock("../../../api/base", async () => {
  const actual = await vi.importActual<typeof import("../../../api/base")>("../../../api/base");
  return { ...actual, fetchJsonApi: fetchSpy };
});

import { API_BASE } from "../../../api/base";
import { ScoringSettings } from "../pages/ScoringSettings";

function serve(sport: string) {
  fetchSpy.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return {};
    if (url.endsWith("/scoring-settings")) return { leagueId: 20, sport, rules: [] };
    if (url.endsWith("/roster-config")) return { leagueId: 20, sport, slots: { QB: 1, BN: 6 } };
    throw new Error(`unexpected url ${url}`);
  });
}

function renderPage(path = "/commissioner/20/scoring") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/commissioner/:leagueId/scoring" element={<ScoringSettings />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchSpy.mockReset();
});

describe("ScoringSettings", () => {
  // The URLs were "GET /api/..." strings: fetch() resolved them against the page,
  // got the app's HTML, and the page crashed on Object.values(undefined).
  it("loads from real API paths, not verb-prefixed strings", async () => {
    serve("NFL");
    renderPage();
    await screen.findByText("Roster Config");
    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([
      `${API_BASE}/leagues/20/scoring-settings`,
      `${API_BASE}/leagues/20/roster-config`,
    ]);
  });

  it("saves roster slots with a PATCH", async () => {
    serve("NFL");
    renderPage();
    fireEvent.click(await screen.findByText("Roster Config"));
    fireEvent.click(screen.getAllByText("+")[0]);
    fireEvent.click(screen.getByText("Save Roster Config"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    const [url, init] = fetchSpy.mock.calls[2];
    expect(url).toBe(`${API_BASE}/leagues/20/roster-config`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ slots: { QB: 2, BN: 6 } });
  });

  it("refuses a non-numeric league id instead of building a traversal URL", async () => {
    serve("NFL");
    renderPage("/commissioner/..%2F..%2Fadmin/scoring");
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends a baseball league to Rules instead of the NFL/NBA editor", async () => {
    serve("MLB");
    renderPage();
    const link = await screen.findByRole("link", { name: "Rules" });
    expect(link.getAttribute("href")).toBe("/rules");
    expect(screen.queryByText("Save Roster Config")).toBeNull();
  });
});
