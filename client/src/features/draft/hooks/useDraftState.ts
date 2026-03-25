import { useState, useEffect, useCallback, useRef } from "react";
import { getDraftState, makePick, pauseDraft, resumeDraft, undoPick, skipPick, startDraft, toggleAutoPick, completeDraft, type DraftState } from "../api";

export function useDraftState(leagueId: number | null) {
  const [state, setState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = useCallback(async () => {
    if (!leagueId) return;
    try {
      const data = await getDraftState(leagueId);
      setState(data);
      setError(null);
    } catch (err) {
      setError((err as Error)?.message || "Failed to load draft");
    }
  }, [leagueId]);

  // Initial load + polling (every 3s when active)
  useEffect(() => {
    if (!leagueId) return;
    setLoading(true);
    fetchState().finally(() => setLoading(false));

    pollRef.current = setInterval(fetchState, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [leagueId, fetchState]);

  const pick = useCallback(async (teamId: number, playerId: number) => {
    if (!leagueId) return;
    const result = await makePick(leagueId, teamId, playerId);
    await fetchState();
    return result;
  }, [leagueId, fetchState]);

  const pause = useCallback(async () => {
    if (!leagueId) return;
    await pauseDraft(leagueId);
    await fetchState();
  }, [leagueId, fetchState]);

  const resume = useCallback(async () => {
    if (!leagueId) return;
    await resumeDraft(leagueId);
    await fetchState();
  }, [leagueId, fetchState]);

  const undo = useCallback(async () => {
    if (!leagueId) return;
    await undoPick(leagueId);
    await fetchState();
  }, [leagueId, fetchState]);

  const skip = useCallback(async () => {
    if (!leagueId) return;
    await skipPick(leagueId);
    await fetchState();
  }, [leagueId, fetchState]);

  const start = useCallback(async () => {
    if (!leagueId) return;
    await startDraft(leagueId);
    await fetchState();
  }, [leagueId, fetchState]);

  const setAutoPick = useCallback(async (teamId: number, enabled: boolean) => {
    if (!leagueId) return;
    await toggleAutoPick(leagueId, teamId, enabled);
    await fetchState();
  }, [leagueId, fetchState]);

  const complete = useCallback(async () => {
    if (!leagueId) return;
    await completeDraft(leagueId);
    await fetchState();
  }, [leagueId, fetchState]);

  return { state, loading, error, pick, pause, resume, undo, skip, start, setAutoPick, complete, refresh: fetchState };
}
