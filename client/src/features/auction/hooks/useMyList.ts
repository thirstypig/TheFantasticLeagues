import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMyList, saveMyList, normalizeMyList } from '../lib/myListApi';

const legacyKey = (teamId: number) => `nominationQueue_${teamId}`;

/**
 * Read the pre-step-F localStorage queue (a JSON array of mlbId strings).
 * Returns null when absent/unreadable. Every storage access is guarded
 * (private windows and blocked site data throw).
 */
function readLegacy(teamId: number): number[] | null {
    try {
        const raw = localStorage.getItem(legacyKey(teamId));
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        return parsed.map(Number).filter(n => Number.isInteger(n) && n > 0);
    } catch {
        return null;
    }
}

function clearLegacy(teamId: number) {
    try { localStorage.removeItem(legacyKey(teamId)); } catch { /* ignore */ }
}

/**
 * Server-backed "my list" of players to put up, in order (mlbIds).
 * The server uses it to auto-nominate when your turn clock runs out.
 *
 * On first load, a non-empty localStorage `nominationQueue_${teamId}` is
 * migrated once: PUT to the server (only when the server list is empty, so it
 * never overwrites newer server data), then the key is deleted. If the PUT
 * fails the key is kept and migration is retried next load.
 */
export function useMyList(leagueId: number | null | undefined, teamId: number | null | undefined) {
    const [list, setList] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const listRef = useRef<number[]>([]);

    const apply = useCallback((next: number[]) => {
        listRef.current = next;
        setList(next);
    }, []);

    useEffect(() => {
        if (!leagueId || !teamId) { apply([]); return; }
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                let server = await fetchMyList(leagueId, teamId);
                const legacy = readLegacy(teamId);
                if (legacy && legacy.length > 0 && server.length === 0) {
                    server = await saveMyList(leagueId, teamId, legacy);
                    clearLegacy(teamId);
                } else if (hasLegacyKey(teamId)) {
                    clearLegacy(teamId); // empty or superseded by server data
                }
                if (!cancelled) { apply(server); setError(null); }
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load your list');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [leagueId, teamId, apply]);

    /** Optimistic save; rolls back to the previous list when the server rejects it. */
    const save = useCallback(async (next: number[]) => {
        if (!leagueId || !teamId) return;
        const clean = normalizeMyList(next);
        const prev = listRef.current;
        apply(clean);
        try {
            const stored = await saveMyList(leagueId, teamId, clean);
            apply(stored);
            setError(null);
        } catch (e) {
            apply(prev);
            setError(e instanceof Error ? e.message : 'Could not save your list');
        }
    }, [leagueId, teamId, apply]);

    const add = useCallback((mlbId: number) => {
        if (listRef.current.includes(mlbId)) return Promise.resolve();
        return save([...listRef.current, mlbId]);
    }, [save]);

    const remove = useCallback((mlbId: number) => save(listRef.current.filter(id => id !== mlbId)), [save]);

    /** Move one player up (-1) or down (+1). No-op at the ends or when absent. */
    const move = useCallback((mlbId: number, delta: -1 | 1) => {
        const cur = listRef.current;
        const i = cur.indexOf(mlbId);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= cur.length) return Promise.resolve();
        const next = [...cur];
        [next[i], next[j]] = [next[j], next[i]];
        return save(next);
    }, [save]);

    /** Replace the whole order (drag/drop). */
    const reorder = useCallback((mlbIds: number[]) => save(mlbIds), [save]);

    const has = useCallback((mlbId: number) => list.includes(mlbId), [list]);

    return { list, loading, error, add, remove, move, reorder, has };
}

function hasLegacyKey(teamId: number): boolean {
    try { return localStorage.getItem(legacyKey(teamId)) !== null; } catch { return false; }
}
