import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../mlbCache.js", () => ({
  cacheGet: vi.fn().mockReturnValue(null),
  cacheSet: vi.fn(),
}));

const fetchMock = vi.fn();
let mlbGetJson: typeof import("../mlbApi.js").mlbGetJson;

const respond = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

/** Run a call to completion while fake timers drive the retry backoff. */
async function settle<T>(p: Promise<T>) {
  const out = p.then(
    (v) => ({ ok: true as const, v }),
    (e: Error) => ({ ok: false as const, e }),
  );
  await vi.runAllTimersAsync();
  return out;
}

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
  ({ mlbGetJson } = await import("../mlbApi.js"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("mlbApi fetchWithRetry", () => {
  it("fetches a 404 exactly once and surfaces the error", async () => {
    fetchMock.mockResolvedValue(respond(404));
    const r = await settle(mlbGetJson("https://x/people/1"));
    expect(r.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("many distinct 404s never open the circuit breaker", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("good") ? respond(200, { ok: 1 }) : respond(404),
    );
    for (let i = 0; i < 8; i++) await settle(mlbGetJson(`https://x/people/${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(8);
    const ok = await settle(mlbGetJson("https://x/good"));
    expect(ok.ok).toBe(true);
  });

  it("a 500 still retries 3 times and 5 of them trip the breaker", async () => {
    fetchMock.mockResolvedValue(respond(500));
    for (let i = 0; i < 5; i++) await settle(mlbGetJson(`https://x/down/${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(15);
    const tripped = await settle(mlbGetJson("https://x/good"));
    expect(tripped.ok).toBe(false);
    expect(String((tripped as { e: Error }).e.message)).toMatch(/circuit breaker open/);
    expect(fetchMock).toHaveBeenCalledTimes(15);
  });

  it("429 behaves as before: retried 3 times and counted as a failure", async () => {
    fetchMock.mockResolvedValue(respond(429));
    await settle(mlbGetJson("https://x/limited"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("warmMlbTeamCache staleness window (todo #304)", () => {
  it("caches per-player team lookups for at most 1 hour, not the 24h team-map TTL", async () => {
    const { cacheSet } = await import("../mlbCache.js");
    const { warmMlbTeamCache, PLAYER_TEAM_TTL } = await import("../mlbApi.js");
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/teams")
        ? respond(200, { teams: [{ id: 119, abbreviation: "LAD" }] })
        : respond(200, { people: [{ id: 660271, currentTeam: { id: 119 } }] }),
    );
    const r = await warmMlbTeamCache(["660271"]);
    expect(r).toEqual({ "660271": "LAD" });
    expect(PLAYER_TEAM_TTL).toBeLessThanOrEqual(3600);
    const peopleCall = (cacheSet as any).mock.calls.find((c: unknown[]) => String(c[0]).includes("/people"));
    expect(peopleCall[2]).toBe(PLAYER_TEAM_TTL);
    const teamsCall = (cacheSet as any).mock.calls.find((c: unknown[]) => String(c[0]).includes("/teams"));
    expect(teamsCall[2]).toBe(86400);
  });
});
