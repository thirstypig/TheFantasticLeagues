import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock at the fetchJsonApi boundary — we're testing URL/method/body
// construction in the wrappers, not the Supabase-auth / error-handling logic
// inside fetchJsonApi itself (that belongs in base.test.ts or integration tests).
vi.mock("../../../api/base", () => ({
  fetchJsonApi: vi.fn(),
  API_BASE: "/api",
}));

import { fetchJsonApi } from "../../../api/base";
import { ilStash, ilActivate } from "../api";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ilStash", () => {
  it("POSTs to /api/transactions/il-stash with the full param payload", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      success: true,
      stashPlayerId: 42,
      addPlayerId: 100,
    });

    const result = await ilStash({
      leagueId: 20,
      teamId: 147,
      stashPlayerId: 42,
      addPlayerId: 100,
    });

    expect(fetchJsonApi).toHaveBeenCalledTimes(1);
    expect(fetchJsonApi).toHaveBeenCalledWith(
      "/api/transactions/il-stash",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          leagueId: 20,
          teamId: 147,
          stashPlayerId: 42,
          addPlayerId: 100,
        }),
      }),
    );
    expect(result).toEqual({ success: true, stashPlayerId: 42, addPlayerId: 100 });
  });

  it("forwards addMlbId / effectiveDate / reason when provided", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      success: true,
      stashPlayerId: 42,
      addPlayerId: 999,
    });

    await ilStash({
      leagueId: 20,
      teamId: 147,
      stashPlayerId: 42,
      addMlbId: 500743,
      effectiveDate: "2026-04-23",
      reason: "Backdated to match MLB IL designation date",
    });

    const [, init] = vi.mocked(fetchJsonApi).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      addMlbId: 500743,
      effectiveDate: "2026-04-23",
      reason: "Backdated to match MLB IL designation date",
    });
    expect(body).not.toHaveProperty("addPlayerId");
  });

  it("propagates server errors unchanged (no swallow, no rewrap)", async () => {
    const serverError = new Error("Team has ghost-IL player");
    vi.mocked(fetchJsonApi).mockRejectedValue(serverError);

    await expect(
      ilStash({ leagueId: 20, teamId: 147, stashPlayerId: 42, addPlayerId: 100 }),
    ).rejects.toBe(serverError);
  });
});

describe("ilActivate", () => {
  it("POSTs to /api/transactions/il-activate with the full param payload", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      success: true,
      activatePlayerId: 42,
      dropPlayerId: 1633,
    });

    const result = await ilActivate({
      leagueId: 20,
      teamId: 147,
      activatePlayerId: 42,
      dropPlayerId: 1633,
    });

    expect(fetchJsonApi).toHaveBeenCalledTimes(1);
    expect(fetchJsonApi).toHaveBeenCalledWith(
      "/api/transactions/il-activate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          leagueId: 20,
          teamId: 147,
          activatePlayerId: 42,
          dropPlayerId: 1633,
        }),
      }),
    );
    expect(result).toEqual({ success: true, activatePlayerId: 42, dropPlayerId: 1633 });
  });

  it("forwards effectiveDate / reason when provided", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      success: true,
      activatePlayerId: 42,
      dropPlayerId: 1633,
    });

    await ilActivate({
      leagueId: 20,
      teamId: 147,
      activatePlayerId: 42,
      dropPlayerId: 1633,
      effectiveDate: "2026-04-23",
      reason: "Commissioner restored prior-period state",
    });

    const [, init] = vi.mocked(fetchJsonApi).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      effectiveDate: "2026-04-23",
      reason: "Commissioner restored prior-period state",
    });
  });

  it("propagates server errors unchanged", async () => {
    const serverError = new Error(
      'effectiveDate (2026-04-23) must be after the drop player was acquired (2026-04-23)',
    );
    vi.mocked(fetchJsonApi).mockRejectedValue(serverError);

    await expect(
      ilActivate({
        leagueId: 20,
        teamId: 147,
        activatePlayerId: 42,
        dropPlayerId: 1633,
      }),
    ).rejects.toBe(serverError);
  });
});
