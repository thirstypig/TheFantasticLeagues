import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { user: { isAdmin: false, memberships: [{ leagueId: "20", role: "OWNER" }] } } }),
}));

import WireListCommissionerPage from "../pages/WireListCommissionerPage";

describe("WireListCommissionerPage gate", () => {
  it("shows Commissioners only. to a non-commissioner", () => {
    render(
      <MemoryRouter initialEntries={["/commissioner/20/wire-list"]}>
        <Routes><Route path="/commissioner/:leagueId/wire-list" element={<WireListCommissionerPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Commissioners only.")).toBeTruthy();
  });
});
