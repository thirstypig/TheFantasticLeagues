// Todo #181: wire contract of updateRosterPosition. Uses the REAL fetchJsonApi
// against a stubbed global fetch, so the assertions are on the actual request
// (method, URL, If-Match header, body) and on how real 409/428 responses turn
// into errors.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }) } },
}));

import { updateRosterPosition } from "../api";
import { ApiError } from "../../../api/base";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("updateRosterPosition If-Match (todo #181)", () => {
  it("PATCHes the roster row with If-Match set to the version and returns the new version", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { roster: { id: 5 }, rosterVersion: 8 }));
    const res = await updateRosterPosition(10, 5, "SS", "2026-05-01", 7);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/teams\/10\/roster\/5$/);
    expect(init.method).toBe("PATCH");
    expect(init.headers["If-Match"]).toBe("7");
    expect(init.headers["Authorization"]).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ assignedPosition: "SS", effectiveDate: "2026-05-01" });
    expect(res.rosterVersion).toBe(8);
  });

  it('sends If-Match: * for screens with no hub version', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { roster: { id: 5 }, rosterVersion: 1 }));
    await updateRosterPosition(10, 5, null, undefined, "*");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["If-Match"]).toBe("*");
    expect(JSON.parse(init.body)).toEqual({ assignedPosition: null });
  });

  it("sends version 0 as '0' (not dropped as falsy)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { roster: { id: 5 }, rosterVersion: 1 }));
    await updateRosterPosition(10, 5, "SS", undefined, 0);
    expect(fetchMock.mock.calls[0][1].headers["If-Match"]).toBe("0");
  });

  it("rejects with ApiError status 409 carrying the server's current version", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: "Roster changed since you last loaded it", rosterVersion: 9 }),
    );
    const err = await updateRosterPosition(10, 5, "SS", undefined, 7).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.body).toEqual({ error: "Roster changed since you last loaded it", rosterVersion: 9 });
  });

  it("rejects with ApiError status 428 when the server says a version is required", async () => {
    fetchMock.mockResolvedValue(jsonResponse(428, { error: "Reload the page and try again." }));
    const err = await updateRosterPosition(10, 5, "SS", undefined, 7).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(428);
  });
});
