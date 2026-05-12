import { useEffect, useState, useCallback, useMemo } from "react";
import {
  getActivePeriod,
  getAddEntries,
  getDropEntries,
  updateDropEntry,
  deleteAddEntry,
  deleteDropEntry,
  reorderEntries,
  type WaiverPeriod,
  type AddEntry,
  type DropEntry,
  type WaiverDropMode,
} from "../api";
import { getTeams } from "../../teams/api";
import { ApiError } from "../../../api/base";
import { reportError } from "../../../lib/errorBus";

export interface UseWireListOwnerResult {
  teamId: number | null;
  period: WaiverPeriod | null;
  adds: AddEntry[];
  drops: DropEntry[];
  loading: boolean;
  error: string | null;
  pending: Set<number>;
  isReadOnly: boolean;
  addPlayerIds: Set<number>;
  dropPlayerIds: Set<number>;
  showAddPicker: boolean;
  setShowAddPicker: (v: boolean) => void;
  showDropPicker: boolean;
  setShowDropPicker: (v: boolean) => void;
  reload: () => Promise<void>;
  withPending: <T>(id: number, fn: () => Promise<T>) => Promise<T>;
  swapAddPriorities: (i: number, dir: -1 | 1) => Promise<void>;
  swapDropPriorities: (i: number, dir: -1 | 1) => Promise<void>;
  removeAdd: (id: number) => Promise<void>;
  removeDrop: (id: number) => Promise<void>;
  setDropMode: (id: number, dropMode: WaiverDropMode) => Promise<void>;
}

export function useWireListOwner(
  leagueId: number | null,
  teamCode: string,
): UseWireListOwnerResult {
  const [teamId, setTeamId] = useState<number | null>(null);
  const [period, setPeriod] = useState<WaiverPeriod | null>(null);
  const [adds, setAdds] = useState<AddEntry[]>([]);
  const [drops, setDrops] = useState<DropEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [showDropPicker, setShowDropPicker] = useState(false);

  const addPlayerIds = useMemo(() => new Set(adds.map((a) => a.playerId)), [adds]);
  const dropPlayerIds = useMemo(() => new Set(drops.map((d) => d.playerId)), [drops]);

  const isReadOnly = !period || period.status !== "PENDING";

  const withPending = useCallback(<T,>(id: number, fn: () => Promise<T>): Promise<T> => {
    setPending((s) => new Set(s).add(id));
    return fn().finally(() => {
      setPending((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    });
  }, []);

  // Memoized inner load so reload() can reference it without capturing stale state.
  // teamId is kept in a ref-like pattern: we derive it during the load, not from state,
  // to avoid the two-effect cascade that existed in the mobile version.
  const reload = useCallback(async () => {
    if (!leagueId || !teamCode) return;
    setLoading(true);
    setError(null);
    try {
      // Parallel fetch: teams + active period are independent.
      const [teams, periodResult] = await Promise.all([
        getTeams(leagueId),
        getActivePeriod(leagueId).catch((err) => {
          if (err instanceof ApiError && err.status === 404) {
            return { period: null };
          }
          throw err;
        }),
      ]);

      const team = teams.find((t) => t.code === teamCode);
      if (!team) {
        setError(`No team with code ${teamCode}`);
        setLoading(false);
        return;
      }

      const resolvedTeamId = team.id;
      setTeamId(resolvedTeamId);

      const p = periodResult.period;
      setPeriod(p);

      if (p) {
        const [a, d] = await Promise.all([
          getAddEntries(p.id, resolvedTeamId),
          getDropEntries(p.id, resolvedTeamId),
        ]);
        setAdds(a.entries);
        setDrops(d.entries);
      } else {
        setAdds([]);
        setDrops([]);
      }
    } catch (err) {
      reportError(err, { source: "wire-list-owner" });
      setError("Failed to load wire list. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [leagueId, teamCode]);

  useEffect(() => { void reload(); }, [reload]);

  const swapAddPriorities = useCallback(async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= adds.length) return;
    if (!period || teamId === null) return;
    const a = adds[i];
    const b = adds[j];
    const reordered = adds.slice();
    reordered[i] = b;
    reordered[j] = a;
    const orderedIds = reordered.map((x) => x.id);
    const optimistic = reordered.map((x, idx) => ({ ...x, priority: idx + 1 }));
    setAdds(optimistic);
    try {
      await withPending(a.id, () =>
        reorderEntries(period.id, "ADD", teamId, orderedIds),
      );
    } catch (err) {
      reportError(err, { source: "wire-list-owner" });
      setError("Failed to reorder. Changes reverted.");
      await reload();
    }
  }, [adds, period, teamId, reload, withPending]);

  const swapDropPriorities = useCallback(async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= drops.length) return;
    if (!period || teamId === null) return;
    const a = drops[i];
    const b = drops[j];
    const reordered = drops.slice();
    reordered[i] = b;
    reordered[j] = a;
    const orderedIds = reordered.map((x) => x.id);
    const optimistic = reordered.map((x, idx) => ({ ...x, priority: idx + 1 }));
    setDrops(optimistic);
    try {
      await withPending(a.id, () =>
        reorderEntries(period.id, "DROP", teamId, orderedIds),
      );
    } catch (err) {
      reportError(err, { source: "wire-list-owner" });
      setError("Failed to reorder. Changes reverted.");
      await reload();
    }
  }, [drops, period, teamId, reload, withPending]);

  const removeAdd = useCallback(async (id: number) => {
    try {
      await withPending(id, () => deleteAddEntry(id));
      await reload();
    } catch (err) {
      reportError(err, { source: "wire-list-owner" });
      setError("Failed to remove.");
    }
  }, [reload, withPending]);

  const removeDrop = useCallback(async (id: number) => {
    try {
      await withPending(id, () => deleteDropEntry(id));
      await reload();
    } catch (err) {
      reportError(err, { source: "wire-list-owner" });
      setError("Failed to remove.");
    }
  }, [reload, withPending]);

  const setDropMode = useCallback(async (id: number, dropMode: WaiverDropMode) => {
    try {
      await withPending(id, () => updateDropEntry(id, { dropMode }));
      await reload();
    } catch (err) {
      reportError(err, { source: "wire-list-owner" });
      setError("Failed to update.");
    }
  }, [reload, withPending]);

  return {
    teamId,
    period,
    adds,
    drops,
    loading,
    error,
    pending,
    isReadOnly,
    addPlayerIds,
    dropPlayerIds,
    showAddPicker,
    setShowAddPicker,
    showDropPicker,
    setShowDropPicker,
    reload,
    withPending,
    swapAddPriorities,
    swapDropPriorities,
    removeAdd,
    removeDrop,
    setDropMode,
  };
}
