import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const auth = vi.hoisted(() => ({ user: null as any }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ me: { user: auth.user } }) }));

import { useIsCommissioner } from "../useIsCommissioner";

const run = (id: number | null) => renderHook(() => useIsCommissioner(id)).result.current;

describe("useIsCommissioner", () => {
  it("admin is always a commissioner", () => {
    auth.user = { isAdmin: true, memberships: [] };
    expect(run(5)).toBe(true);
  });
  it("commissioner membership counts for that league only", () => {
    auth.user = { isAdmin: false, memberships: [{ leagueId: "5", role: "COMMISSIONER" }] };
    expect(run(5)).toBe(true);
    expect(run(6)).toBe(false);
  });
  it("owner membership is not enough", () => {
    auth.user = { isAdmin: false, memberships: [{ leagueId: "5", role: "OWNER" }] };
    expect(run(5)).toBe(false);
  });
  it("no user, or no league, is false", () => {
    auth.user = null;
    expect(run(5)).toBe(false);
    auth.user = { isAdmin: false, memberships: [{ leagueId: "5", role: "COMMISSIONER" }] };
    expect(run(null)).toBe(false);
  });
});
