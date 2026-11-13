/**
 * LeagueContext · which league is shown.
 *
 * Regression: the provider used to force the user's primary league every time
 * the user object changed (every page load and every /auth/me refresh after a
 * token refresh, about hourly), throwing away a league picked in
 * Account → Switch League.
 */
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../api", () => ({
  getLeagues: vi.fn(async () => ({ leagues: [{ id: 8, name: "Eight" }, { id: 9, name: "Nine" }] })),
}));
vi.mock("../../features/seasons/api", () => ({ getCurrentSeason: vi.fn(async () => null) }));
vi.mock("../../api/base", () => ({ API_BASE: "/api", fetchJsonApi: vi.fn(async () => ({})) }));

import { LeagueProvider, resolveLeagueId, useLeague } from "../LeagueContext";

const member = (leagueId: number, role = "OWNER") => ({ leagueId, role });

describe("resolveLeagueId", () => {
  it("keeps a pick that is one of the user's memberships", () => {
    expect(resolveLeagueId(8, [member(9), member(8)], null)).toBe(8);
  });

  it("keeps a pick that is in the league list (admins viewing a league they are not in)", () => {
    expect(resolveLeagueId(20, [member(9)], [{ id: 9 }, { id: 20 }])).toBe(20);
  });

  it("waits for the league list before replacing a non-member pick", () => {
    expect(resolveLeagueId(20, [member(9)], null)).toBe(20);
  });

  it("falls back to the first OWNER membership, then the first membership, then the list", () => {
    expect(resolveLeagueId(1, [member(8, "COMMISSIONER"), member(9)], [{ id: 8 }, { id: 9 }])).toBe(9);
    expect(resolveLeagueId(1, [member(8, "COMMISSIONER")], [{ id: 8 }])).toBe(8);
    expect(resolveLeagueId(1, [], [{ id: 5 }])).toBe(5);
    expect(resolveLeagueId(1, [], [])).toBe(1);
  });
});

function Probe() {
  const { leagueId, setLeagueId } = useLeague();
  return (
    <>
      <p data-testid="league">{leagueId}</p>
      <button onClick={() => setLeagueId(8)}>pick 8</button>
    </>
  );
}

describe("LeagueProvider", () => {
  beforeEach(() => localStorage.clear());

  it("a picked league survives a user refresh and a reload", async () => {
    auth.user = { id: 1, memberships: [member(9), member(8)] };
    const view = render(<LeagueProvider><Probe /></LeagueProvider>);
    await waitFor(() => expect(screen.getByTestId("league").textContent).toBe("9"));

    act(() => screen.getByText("pick 8").click());
    expect(screen.getByTestId("league").textContent).toBe("8");

    // /auth/me refreshed: same memberships, new object
    auth.user = { id: 1, memberships: [member(9), member(8)] };
    view.rerender(<LeagueProvider><Probe /></LeagueProvider>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("league").textContent).toBe("8");
    view.unmount();

    // reload: a fresh provider reads the pick back from storage
    render(<LeagueProvider><Probe /></LeagueProvider>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("league").textContent).toBe("8");
  });

  it("a stored league the user lost access to falls back to their primary league", async () => {
    localStorage.setItem("fbst-league-id", "3");
    auth.user = { id: 1, memberships: [member(9)] };
    render(<LeagueProvider><Probe /></LeagueProvider>);
    await waitFor(() => expect(screen.getByTestId("league").textContent).toBe("9"));
    expect(localStorage.getItem("fbst-league-id")).toBe("9");
  });
});
