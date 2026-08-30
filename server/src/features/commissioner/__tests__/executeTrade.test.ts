import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression cover for the commissioner's direct-trade path.
 *
 * `POST /api/commissioner/:leagueId/execute-trade` is a parallel implementation
 * of the owner flow in `features/trades/routes.ts`, and it drifted twice:
 *
 *   1. It wrote `assignedPosition: null` on the receiving Roster row, dropping
 *      the slot the player occupied. The client narrows an unknown slot code to
 *      "BN" (`toHubPlayer.ts` → `narrowSlot`), so every traded hitter landed on
 *      the bench. Observed in prod on 2026-08-30 (trade 22, OGBA).
 *   2. It stamped `acquiredAt`/`releasedAt` with `new Date()` instead of a
 *      resolved effective date, so a commissioner recording an offline trade
 *      dated it to the moment of entry rather than when the trade happened.
 *
 * The owner path at `features/trades/routes.ts:498-511` is the reference
 * behaviour these tests pin.
 */

const { mockPrisma, mockTx } = vi.hoisted(() => {
  const mockTx = {
    trade: { create: vi.fn() },
    roster: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    team: { findUnique: vi.fn(), update: vi.fn() },
    draftPick: { updateMany: vi.fn() },
  };
  return {
    mockTx,
    mockPrisma: {
      team: { findMany: vi.fn() },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mockTx)),
    },
  };
});

vi.mock("../../../db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/rosterGuard.js", () => ({
  assertPlayerAvailable: vi.fn(),
  assertRosterLimit: vi.fn(),
}));

const EFFECTIVE = new Date("2026-08-02T00:00:00.000Z");
vi.mock("../../../lib/rosterWindow.js", () => ({
  resolveEffectiveDate: vi.fn(() => EFFECTIVE),
  assertNoOwnershipConflict: vi.fn(),
}));

import { CommissionerService } from "../services/CommissionerService.js";

const service = new CommissionerService();
const LEAGUE = 20;
const SENDER = 143;
const RECIPIENT = 142;
const PLAYER = 1655;

/** Wire the happy path: both teams in-league, one PLAYER item, one sender stint. */
function arrangeTrade(senderStint: {
  id: number;
  assignedPosition: string | null;
  price?: number;
}) {
  mockPrisma.team.findMany.mockResolvedValue([
    { id: SENDER, leagueId: LEAGUE },
    { id: RECIPIENT, leagueId: LEAGUE },
  ]);
  mockTx.trade.create.mockResolvedValue({
    id: 99,
    items: [
      {
        id: 1,
        senderId: SENDER,
        recipientId: RECIPIENT,
        assetType: "PLAYER",
        playerId: PLAYER,
      },
    ],
  });
  mockTx.roster.findFirst.mockResolvedValue({
    id: senderStint.id,
    teamId: SENDER,
    playerId: PLAYER,
    assignedPosition: senderStint.assignedPosition,
    price: senderStint.price ?? 10,
    releasedAt: null,
  });
  mockTx.roster.update.mockResolvedValue({});
  mockTx.roster.create.mockResolvedValue({});
}

const ITEMS = [
  {
    senderId: SENDER,
    recipientId: RECIPIENT,
    assetType: "PLAYER",
    playerId: PLAYER,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CommissionerService.executeTrade — slot carry-over", () => {
  it("carries the sender's assignedPosition onto the receiving roster row", async () => {
    arrangeTrade({ id: 4001, assignedPosition: "OF" });

    await service.executeTrade(LEAGUE, ITEMS);

    expect(mockTx.roster.create).toHaveBeenCalledTimes(1);
    const created = mockTx.roster.create.mock.calls[0][0].data;
    expect(created.assignedPosition).toBe("OF");
  });

  it("never writes a null slot — an unslotted sender falls back to the player's primary position", async () => {
    arrangeTrade({ id: 4002, assignedPosition: null });
    mockTx.roster.findFirst.mockResolvedValue({
      id: 4002,
      teamId: SENDER,
      playerId: PLAYER,
      assignedPosition: null,
      price: 10,
      releasedAt: null,
      player: { posPrimary: "LF" },
    });

    await service.executeTrade(LEAGUE, ITEMS);

    const created = mockTx.roster.create.mock.calls[0][0].data;
    expect(created.assignedPosition).not.toBeNull();
    expect(created.assignedPosition).toBe("LF");
  });

  it("maps a pitcher's primary position to the P slot, matching the owner path", async () => {
    arrangeTrade({ id: 4003, assignedPosition: null });
    mockTx.roster.findFirst.mockResolvedValue({
      id: 4003,
      teamId: SENDER,
      playerId: PLAYER,
      assignedPosition: null,
      price: 10,
      releasedAt: null,
      player: { posPrimary: "SP" },
    });

    await service.executeTrade(LEAGUE, ITEMS);

    const created = mockTx.roster.create.mock.calls[0][0].data;
    expect(created.assignedPosition).toBe("P");
  });
});

describe("CommissionerService.executeTrade — effective dating", () => {
  it("dates both sides of the move from the resolved effective date, not the wall clock", async () => {
    arrangeTrade({ id: 4004, assignedPosition: "P" });

    await service.executeTrade(LEAGUE, ITEMS, "2026-08-02");

    const released = mockTx.roster.update.mock.calls[0][0].data;
    const acquired = mockTx.roster.create.mock.calls[0][0].data;
    expect(released.releasedAt).toEqual(EFFECTIVE);
    expect(acquired.acquiredAt).toEqual(EFFECTIVE);
  });
});
