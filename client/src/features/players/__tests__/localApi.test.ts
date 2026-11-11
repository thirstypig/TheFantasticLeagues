import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchJsonApi = vi.hoisted(() => vi.fn());
vi.mock("../../../api/base", async (orig) => ({ ...(await orig<typeof import("../../../api/base")>()), fetchJsonApi }));

import { addToWireList, getPendingWirePeriodId, getWireListAddedPlayerIds } from "../api";

beforeEach(() => fetchJsonApi.mockReset());

describe("players wire-list wrappers", () => {
  it("addToWireList POSTs { teamId, playerId } to the period's adds", async () => {
    fetchJsonApi.mockResolvedValue({});
    await addToWireList(3, 11, 1);
    const [url, init] = fetchJsonApi.mock.calls[0];
    expect(url).toMatch(/\/wire-list\/periods\/3\/adds$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ teamId: 1, playerId: 11 });
  });

  it("only a PENDING period counts", async () => {
    fetchJsonApi.mockResolvedValue({ period: { id: 3, status: "LOCKED" } });
    expect(await getPendingWirePeriodId(20)).toBeNull();
    fetchJsonApi.mockResolvedValue({ period: { id: 4, status: "PENDING" } });
    expect(await getPendingWirePeriodId(20)).toBe(4);
    fetchJsonApi.mockResolvedValue({ period: null });
    expect(await getPendingWirePeriodId(20)).toBeNull();
  });

  it("getWireListAddedPlayerIds reads player ids from the team's adds", async () => {
    fetchJsonApi.mockResolvedValue({ entries: [{ player: { id: 5 } }, { playerId: 6 }] });
    expect(await getWireListAddedPlayerIds(3, 1)).toEqual([5, 6]);
    expect(fetchJsonApi.mock.calls[0][0]).toMatch(/periods\/3\/adds\?teamId=1$/);
  });
});
