import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const openCard = vi.fn();
vi.mock("../../../components/shared/playerCard/PlayerCardProvider", () => ({
  usePlayerCard: () => ({ open: openCard, close: vi.fn() }),
  PlayerLink: ({ name }: { name: string }) => <span>{name}</span>,
}));
vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { user: { id: 1, isAdmin: false, memberships: [] } } }),
}));

const card = (over: Record<string, unknown>) => ({
  id: 1, leagueId: 1, userId: 2, column: "trade_block", title: "Mookie Betts", body: null, type: "trade_block",
  metadata: { playerId: 11, mlbId: 605141 }, pinned: false, periodId: null, expiresAt: null,
  thumbsUp: 0, thumbsDown: 0, createdAt: new Date().toISOString(), deletedAt: null, user: null,
  replies: [], myVote: null, replyCount: 0, ...over,
});
let items: unknown[] = [];
vi.mock("../api", () => ({
  getBoardCards: vi.fn(() => Promise.resolve({ items, total: items.length, limit: 100 })),
  createBoardCard: vi.fn(),
  voteBoardCard: vi.fn(),
  replyToBoardCard: vi.fn(),
  deleteBoardCard: vi.fn(),
}));

import LeagueBoard from "../components/LeagueBoard";

beforeEach(() => openCard.mockClear());

describe("LeagueBoard player card", () => {
  it("clicking a trade block card opens the card for its metadata.mlbId", async () => {
    items = [card({})];
    render(<LeagueBoard leagueId={1} />);
    fireEvent.click((await screen.findAllByText("Mookie Betts"))[0]);
    expect(openCard).toHaveBeenCalledWith(605141);
  });

  it("a trade block card with no mlbId opens nothing and falls through to the normal card behavior (no dead click)", async () => {
    items = [card({ metadata: { playerId: 11 } })];
    render(<LeagueBoard leagueId={1} />);
    const before = (await screen.findAllByText("Mookie Betts")).length;
    fireEvent.click((await screen.findAllByText("Mookie Betts"))[0]);
    expect(openCard).not.toHaveBeenCalled();
    // The slide-over (desktop) shows the card's title a second time.
    expect(screen.getAllByText("Mookie Betts").length).toBeGreaterThan(before);
  });
});
