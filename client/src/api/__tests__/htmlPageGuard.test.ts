import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import { fetchJsonApi, fetchJsonPublic, ApiError } from "../base";

const html = "<!doctype html><html><body>app</body></html>";

function stubFetch(body: string, contentType: string, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers: { "content-type": contentType } })));
}

afterEach(() => vi.unstubAllGlobals());

// A 200 HTML page is the SPA fallback answering a wrong URL. It used to come
// back as {} and crashed the commissioner scoring page later, far from the cause.
describe("fetchJsonApi / fetchJsonPublic: HTML page instead of JSON", () => {
  it.each([["fetchJsonApi", fetchJsonApi], ["fetchJsonPublic", fetchJsonPublic]] as const)(
    "%s throws an ApiError that names the URL",
    async (_name, fn) => {
      stubFetch(html, "text/html; charset=UTF-8");
      const err = await fn("/commissioner/20/GET /api/x").catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.message).toContain("/commissioner/20/GET /api/x");
      expect(err.message).toContain("HTML page");
    },
  );

  it("still returns parsed JSON", async () => {
    stubFetch('{"slots":{"QB":1}}', "application/json");
    await expect(fetchJsonApi("/api/leagues/20/roster-config")).resolves.toEqual({ slots: { QB: 1 } });
  });

  it("still returns {} for an empty 204-style body", async () => {
    stubFetch("", "text/html");
    await expect(fetchJsonApi("/api/x")).resolves.toEqual({});
  });
});
