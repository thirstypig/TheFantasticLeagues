import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { user: { isAdmin: false, memberships: [{ leagueId: "20", role: "OWNER" }] } } }),
}));
// Any fetch means the gate leaked the page body.
const fetchSpy = vi.hoisted(() => vi.fn());
vi.mock("../../../api/base", async () => {
  const actual = await vi.importActual<typeof import("../../../api/base")>("../../../api/base");
  return { ...actual, fetchJsonApi: fetchSpy };
});

import CommissionerSectionPage from "../pages/CommissionerSectionPage";
import { ScoringSettings } from "../pages/ScoringSettings";

function at(path: string, route: string, el: JSX.Element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path={route} element={el} /></Routes>
    </MemoryRouter>,
  );
}

describe("commissioner pages gate non-commissioners", () => {
  it("CommissionerSectionPage", () => {
    at("/commissioner/20/rosters", "/commissioner/:leagueId/:section", <CommissionerSectionPage />);
    expect(screen.getByText("Commissioners only.")).toBeTruthy();
  });
  it("ScoringSettings", () => {
    at("/commissioner/20/scoring", "/commissioner/:leagueId/scoring", <ScoringSettings />);
    expect(screen.getByText("Commissioners only.")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
