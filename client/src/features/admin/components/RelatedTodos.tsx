import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Circle, Loader2 } from "lucide-react";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { useAuth } from "../../../auth/AuthProvider";

/**
 * Reverse cross-link panel shown on /roadmap and /concepts sections.
 *
 * Fetches the admin todo list and filters down to the subset whose
 * `roadmapLink` / `conceptLink` anchor matches the caller's `anchor` prop.
 *
 * Admin-only: regular users see nothing (returns null).
 *
 * Usage:
 *   <RelatedTodos kind="roadmap" anchor="monetization" />   // on a Roadmap phase
 *   <RelatedTodos kind="concept"  anchor="pricing"        /> // on a Concept card
 */

type Status = "not_started" | "in_progress" | "done";
type Priority = "p0" | "p1" | "p2" | "p3";

interface Todo {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  roadmapLink?: string;
  conceptLink?: string;
}

interface Category {
  id: string;
  title: string;
  tasks: Todo[];
}

interface TodoData {
  categories: Category[];
}

// Module-level singleton so multiple <RelatedTodos> on one page share one fetch.
let cached: TodoData | null = null;
let inflight: Promise<TodoData> | null = null;

async function loadTodos(): Promise<TodoData> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = fetchJsonApi<TodoData>(`${API_BASE}/admin/todos`)
    .then((d) => {
      cached = d;
      return d;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const STATUS_ICON: Record<Status, { icon: typeof Check; cls: string }> = {
  not_started: { icon: Circle, cls: "text-slate-500" },
  in_progress: { icon: Loader2, cls: "text-amber-400" },
  done: { icon: Check, cls: "text-emerald-400" },
};

const PRIORITY_CLS: Record<Priority, string> = {
  p0: "text-red-400 border-red-500/30",
  p1: "text-orange-400 border-orange-500/30",
  p2: "text-yellow-400 border-yellow-500/30",
  p3: "text-slate-400 border-slate-500/30",
};

interface RelatedTodosProps {
  /** Which link field to match against. */
  kind: "roadmap" | "concept";
  /** The anchor id to match (without `#`). e.g. "monetization", "pricing". */
  anchor: string;
  /** Optional heading override. */
  title?: string;
}

export default function RelatedTodos({ kind, anchor, title }: RelatedTodosProps) {
  const { isAdmin } = useAuth();
  const [data, setData] = useState<TodoData | null>(cached);

  useEffect(() => {
    if (!isAdmin) return;
    if (cached) {
      setData(cached);
      return;
    }
    let alive = true;
    loadTodos()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        /* silent — reverse links are a secondary affordance */
      });
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const matching = useMemo(() => {
    if (!data) return [] as Array<Todo & { categoryTitle: string }>;
    const targetSuffix = `#${anchor}`;
    const field = kind === "roadmap" ? "roadmapLink" : "conceptLink";
    const results: Array<Todo & { categoryTitle: string }> = [];
    for (const cat of data.categories) {
      for (const t of cat.tasks) {
        const link = t[field];
        if (link && link.endsWith(targetSuffix)) {
          results.push({ ...t, categoryTitle: cat.title });
        }
      }
    }
    // Open work first, priority order, then done.
    const activeRank = { not_started: 1, in_progress: 0, done: 2 } as const;
    const prioRank = { p0: 0, p1: 1, p2: 2, p3: 3 } as const;
    return results.sort((a, b) => {
      if (activeRank[a.status] !== activeRank[b.status]) {
        return activeRank[a.status] - activeRank[b.status];
      }
      return prioRank[a.priority] - prioRank[b.priority];
    });
  }, [data, kind, anchor]);

  if (!isAdmin) return null;
  if (!data || matching.length === 0) return null;

  return (
    <div className="mt-3 rounded-md border border-[var(--lg-border-faint)] bg-[var(--lg-tint)]/50 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--lg-text-muted)]">
          {title ?? "Related tasks"}
        </span>
        <Link
          to="/todo"
          className="text-[10px] text-[var(--lg-accent)] hover:underline"
        >
          Manage in /todo →
        </Link>
      </div>
      <ul className="space-y-1">
        {matching.map((t) => {
          const { icon: StatusIcon, cls } = STATUS_ICON[t.status];
          return (
            <li key={t.id} className="flex items-start gap-2 text-xs">
              <StatusIcon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${cls}`} />
              <Link
                to={`/todo#${t.id}`}
                className="flex-1 text-[var(--lg-text-secondary)] hover:text-[var(--lg-text-primary)]"
              >
                {t.title}
              </Link>
              <span
                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${PRIORITY_CLS[t.priority]}`}
              >
                {t.priority}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
