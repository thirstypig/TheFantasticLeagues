/*
 * Aurora-specific behavior tests for the AuctionValues page (PR #145).
 *
 * Scope: ONLY what Aurora adds beyond the legacy data behavior, which
 * is fully covered by AuctionValuesLegacy.test.tsx running against the
 * preserved legacy implementation.
 *
 * Concrete regressions these tests prevent:
 *   - Someone deletes the footer escape link, leaving users no way to
 *     fall back to /auction-values-classic if Aurora misses a feature.
 *   - Someone re-points the link to a wrong route.
 *   - Aurora wrapper class disappears (would break the scoped CSS
 *     tokens — Aurora atoms only resolve their custom properties under
 *     `.aurora-theme`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../api", () => ({
  getAuctionValues: vi.fn().mockResolvedValue([]),
  getLeague: vi.fn().mockResolvedValue({ league: { teams: [] } }),
}));

vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({ leagueId: 1, outfieldMode: "OF" }),
}));

vi.mock("../../../components/shared/PlayerDetailModal", () => ({
  default: () => null,
}));

import AuctionValues from "../pages/AuctionValues";

beforeEach(() => {
  vi.clearAllMocks();
});

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={["/auction-values"]}>
      <AuctionValues />
    </MemoryRouter>,
  );
}

describe("Aurora AuctionValues", () => {
  it("renders Aurora hero copy ('Projected dollar values.')", async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /projected dollar values/i })).toBeInTheDocument();
    });
  });

  it("wraps content in the .aurora-theme container so scoped CSS tokens resolve", async () => {
    const { container } = renderWithRouter();
    await waitFor(() => {
      // Aurora atoms (Glass, IridText, AmbientBg) all rely on CSS
      // variables scoped to .aurora-theme; without this wrapper the
      // page renders unstyled. Smoke-test that the wrapper survives.
      expect(container.querySelector(".aurora-theme")).not.toBeNull();
    });
  });

  it("renders the footer escape link to /auction-values-classic", async () => {
    renderWithRouter();
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /view classic auction values/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/auction-values-classic");
    });
  });
});
