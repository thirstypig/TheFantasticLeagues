/**
 * Client wrapper contract tests for /api/wire-list/*.
 *
 * Mocks at the fetchJsonApi boundary — we're testing URL/method/body
 * construction in the wrappers, not auth or error-handling inside
 * fetchJsonApi itself. Each test prevents a specific regression class:
 *   - Route refactor (path drift):     URL string asserted exactly
 *   - HTTP verb change (PATCH→PUT):    method asserted
 *   - Body shape drift:                JSON body asserted
 *   - Re-export name drift:            named-import resolution at top
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../api/base", async () => {
  const actual = await vi.importActual<typeof import("../../../api/base")>(
    "../../../api/base",
  );
  return { ...actual, fetchJsonApi: vi.fn(), API_BASE: "/api" };
});

import { fetchJsonApi } from "../../../api/base";
import {
  getActivePeriod,
  listPeriods,
  createWirePeriod,
  getPeriodResults,
  getAddEntries,
  getDropEntries,
  createAddEntry,
  createDropEntry,
  updateAddPriority,
  updateDropEntry,
  deleteAddEntry,
  deleteDropEntry,
  lockPeriod,
  finalizePeriod,
  succeedAdd,
  failAdd,
  skipAdd,
  revertAdd,
} from "../api";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wire-list api wrappers", () => {
  describe("period CRUD", () => {
    it("getActivePeriod GETs /periods/active with leagueId query", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ period: null });
      await getActivePeriod(20);
      expect(fetchJsonApi).toHaveBeenCalledWith("/api/wire-list/periods/active?leagueId=20");
    });

    it("listPeriods GETs /leagues/:id/periods", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ periods: [] });
      await listPeriods(20);
      expect(fetchJsonApi).toHaveBeenCalledWith("/api/wire-list/leagues/20/periods");
    });

    it("createWirePeriod POSTs deadlineAt to /leagues/:id/periods", async () => {
      // Regression target: before #264, this collided with seasons/createPeriod.
      // The rename is load-bearing — if reverted, the wrapper silently shadows
      // a different function and this import line breaks at compile time.
      vi.mocked(fetchJsonApi).mockResolvedValue({ id: 1 });
      await createWirePeriod(20, "2026-12-31T23:59:59.000Z");
      expect(fetchJsonApi).toHaveBeenCalledWith(
        "/api/wire-list/leagues/20/periods",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ deadlineAt: "2026-12-31T23:59:59.000Z" }),
        }),
      );
    });

    it("getPeriodResults GETs /periods/:id/results", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ period: {}, byTeam: [] });
      await getPeriodResults(42);
      expect(fetchJsonApi).toHaveBeenCalledWith("/api/wire-list/periods/42/results");
    });
  });

  describe("add entry CRUD", () => {
    it("getAddEntries GETs /periods/:id/adds with teamId query", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ entries: [] });
      await getAddEntries(5, 147);
      expect(fetchJsonApi).toHaveBeenCalledWith("/api/wire-list/periods/5/adds?teamId=147");
    });

    it("createAddEntry POSTs to /periods/:id/adds with teamId+playerId", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ id: 1 });
      await createAddEntry(5, { teamId: 147, playerId: 12 });
      expect(fetchJsonApi).toHaveBeenCalledWith(
        "/api/wire-list/periods/5/adds",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ teamId: 147, playerId: 12 }),
        }),
      );
    });

    it("updateAddPriority PATCHes /adds/:id with { priority }", async () => {
      // Regression target: the swap-through-temp-priority reorder relies on
      // PATCH semantics. If someone changes the verb to PUT (full replace),
      // the entry's outcome/consumedDropEntryId fields get nulled.
      vi.mocked(fetchJsonApi).mockResolvedValue({ id: 1 });
      await updateAddPriority(7, 3);
      expect(fetchJsonApi).toHaveBeenCalledWith(
        "/api/wire-list/adds/7",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ priority: 3 }),
        }),
      );
    });

    it("deleteAddEntry DELETEs /adds/:id", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ success: true });
      await deleteAddEntry(7);
      expect(fetchJsonApi).toHaveBeenCalledWith(
        "/api/wire-list/adds/7",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("drop entry CRUD", () => {
    it("getDropEntries GETs /periods/:id/drops with teamId query", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ entries: [] });
      await getDropEntries(5, 147);
      expect(fetchJsonApi).toHaveBeenCalledWith("/api/wire-list/periods/5/drops?teamId=147");
    });

    it("createDropEntry POSTs without dropMode (server defaults to RELEASE)", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ id: 1 });
      await createDropEntry(5, { teamId: 147, playerId: 12 });
      const call = vi.mocked(fetchJsonApi).mock.calls[0];
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(call[0]).toBe("/api/wire-list/periods/5/drops");
      expect(body).toEqual({ teamId: 147, playerId: 12 });
      expect(body.dropMode).toBeUndefined();
    });

    it("createDropEntry includes dropMode when provided", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ id: 1 });
      await createDropEntry(5, { teamId: 147, playerId: 12, dropMode: "IL_STASH" });
      const body = JSON.parse((vi.mocked(fetchJsonApi).mock.calls[0][1] as RequestInit).body as string);
      expect(body.dropMode).toBe("IL_STASH");
    });

    it("updateDropEntry PATCHes with partial body — priority only", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ id: 1 });
      await updateDropEntry(9, { priority: 2 });
      const body = JSON.parse((vi.mocked(fetchJsonApi).mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({ priority: 2 });
    });

    it("updateDropEntry PATCHes with partial body — dropMode only", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ id: 1 });
      await updateDropEntry(9, { dropMode: "RELEASE" });
      const body = JSON.parse((vi.mocked(fetchJsonApi).mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({ dropMode: "RELEASE" });
    });

    it("deleteDropEntry DELETEs /drops/:id", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ success: true });
      await deleteDropEntry(9);
      expect(fetchJsonApi).toHaveBeenCalledWith(
        "/api/wire-list/drops/9",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("processor (commissioner)", () => {
    it("lockPeriod POSTs /periods/:id/lock", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ id: 1 });
      await lockPeriod(42);
      expect(fetchJsonApi).toHaveBeenCalledWith(
        "/api/wire-list/periods/42/lock",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("finalizePeriod POSTs /periods/:id/finalize", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ period: {}, addsApplied: 0, dropsConsumed: 0, dropsUnused: 0 });
      await finalizePeriod(42);
      expect(fetchJsonApi).toHaveBeenCalledWith(
        "/api/wire-list/periods/42/finalize",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("succeedAdd POSTs /adds/:id/succeed (no body)", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ id: 1 });
      await succeedAdd(100);
      expect(fetchJsonApi).toHaveBeenCalledWith(
        "/api/wire-list/adds/100/succeed",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("failAdd POSTs /adds/:id/fail with empty body when no reason", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ id: 1 });
      await failAdd(100);
      const call = vi.mocked(fetchJsonApi).mock.calls[0];
      expect(call[0]).toBe("/api/wire-list/adds/100/fail");
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body).toEqual({});
    });

    it("failAdd POSTs reason in body when provided", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ id: 1 });
      await failAdd(100, "Player just got injured");
      const body = JSON.parse((vi.mocked(fetchJsonApi).mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({ reason: "Player just got injured" });
    });

    it("skipAdd POSTs /adds/:id/skip", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ id: 1 });
      await skipAdd(100);
      expect(fetchJsonApi).toHaveBeenCalledWith(
        "/api/wire-list/adds/100/skip",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("revertAdd POSTs /adds/:id/revert", async () => {
      vi.mocked(fetchJsonApi).mockResolvedValue({ id: 1 });
      await revertAdd(100);
      expect(fetchJsonApi).toHaveBeenCalledWith(
        "/api/wire-list/adds/100/revert",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
