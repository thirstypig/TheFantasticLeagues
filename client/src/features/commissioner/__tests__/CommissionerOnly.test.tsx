import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { user: { isAdmin: false, memberships: [{ leagueId: "20", role: "OWNER" }] } } }),
}));

import { CommissionerOnly } from "../components/CommissionerOnly";

describe("CommissionerOnly", () => {
  it("shows the notice and hides children for a non-commissioner", () => {
    render(<CommissionerOnly leagueId={20}><button>Danger</button></CommissionerOnly>);
    expect(screen.getByText("Commissioners only.")).toBeTruthy();
    expect(screen.queryByText("Danger")).toBeNull();
  });
});
