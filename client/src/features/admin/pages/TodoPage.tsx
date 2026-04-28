import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { ChevronDown, ChevronRight, Plus, Check, Circle, Loader2, ExternalLink, Calendar } from "lucide-react";
import AdminCrossNav from "../components/AdminCrossNav";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";

type Status = "not_started" | "in_progress" | "done";
type Priority = "p0" | "p1" | "p2" | "p3";

interface Todo {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  owner?: string;
  instructions?: string[];
  notes?: string;
  targetDate?: string;
  roadmapLink?: string;
  conceptLink?: string;
  updatedAt?: string;
  createdAt?: string;
}

interface Category {
  id: string;
  title: string;
  description: string;
  tasks: Todo[];
}

interface TodoData {
  categories: Category[];
}

type Filter = "all" | "active" | "done";

const STATUS_CONFIG = {
  not_started: { label: "Not Started", color: "text-slate-500", bg: "bg-slate-500/10 border-slate-500/20", icon: Circle },
  in_progress: { label: "In Progress", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: Loader2 },
  done: { label: "Done", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: Check },
} as const;

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  p0: { label: "P0", color: "text-red-400 bg-red-500/10 border-red-500/30" },
  p1: { label: "P1", color: "text-orange-400 bg-orange-500/10 border-orange-500/30" },
  p2: { label: "P2", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" },
  p3: { label: "P3", color: "text-slate-400 bg-slate-500/10 border-slate-500/30" },
};

const NEXT_STATUS: Record<Status, Status> = {
  not_started: "in_progress",
  in_progress: "done",
  done: "not_started",
};

export default function TodoPage() {
  const [data, setData] = useState<TodoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedTodo, setExpandedTodo] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("active");

  const load = useCallback(async () => {
    try {
      const res = await fetchJsonApi<TodoData>(`${API_BASE}/admin/todos`);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleStatus = async (todoId: string) => {
    if (!data) return;
    const todo = data.categories.flatMap(c => c.tasks).find(t => t.id === todoId);
    if (!todo) return;

    const newStatus = NEXT_STATUS[todo.status];
    setUpdating(prev => new Set(prev).add(todoId));

    try {
      await fetchJsonApi(`${API_BASE}/admin/todos/${todoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      todo.status = newStatus;
      setData({ ...data });
    } finally {
      setUpdating(prev => { const n = new Set(prev); n.delete(todoId); return n; });
    }
  };

  const addTodo = async (categoryId: string) => {
    if (!newTitle.trim()) return;
    try {
      await fetchJsonApi(`${API_BASE}/admin/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, title: newTitle.trim() }),
      });
      setNewTitle("");
      setAddingTo(null);
      load();
    } catch { /* ignore */ }
  };

  // Apply filter before computing totals so progress reflects current view
  const filteredData = useMemo(() => {
    if (!data) return null;
    if (filter === "all") return data;
    return {
      categories: data.categories.map(c => ({
        ...c,
        tasks: c.tasks.filter(t => filter === "done" ? t.status === "done" : t.status !== "done"),
      })),
    };
  }, [data, filter]);

  if (loading) return <div className="text-[var(--lg-text-muted)] py-12 text-center">Loading todos...</div>;
  if (!data) return <div className="text-[var(--lg-text-muted)] py-12 text-center">Failed to load todos.</div>;

  const allTodos = data.categories.flatMap(c => c.tasks);
  const totals = {
    total: allTodos.length,
    done: allTodos.filter(t => t.status === "done").length,
    inProgress: allTodos.filter(t => t.status === "in_progress").length,
    notStarted: allTodos.filter(t => t.status === "not_started").length,
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass strong>
        <SectionLabel>✦ Admin · Todo</SectionLabel>
        <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
          Day-to-day tasks.
        </h1>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
          Grouped by category. Click a row to expand steps.
        </div>
        <div style={{ marginTop: 12 }}>
          <AdminCrossNav />
        </div>
      </Glass>

      <main>
        <Glass>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 12 }}>
              <span style={{ color: "var(--am-text-muted)" }}><strong style={{ color: "var(--am-text)", fontWeight: 700 }}>{totals.done}</strong> / {totals.total} done</span>
              <span style={{ color: "rgb(251, 191, 36)" }}><strong style={{ fontWeight: 700 }}>{totals.inProgress}</strong> in progress</span>
              <span style={{ color: "var(--am-text-faint)" }}><strong style={{ fontWeight: 700 }}>{totals.notStarted}</strong> not started</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ height: 8, width: 192, background: "var(--am-surface-faint)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "rgb(16, 185, 129)", width: `${totals.total > 0 ? (totals.done / totals.total) * 100 : 0}%`, transition: "width 500ms" }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--am-text-muted)" }}>
                {totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0}%
              </span>
            </div>
          </div>
        </Glass>
        <div style={{ height: 16 }} />

        {/* Filter buttons */}
        <div className="flex items-center gap-2 mb-6">
          {(["all", "active", "done"] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-bold uppercase px-3 py-1.5 rounded-lg border transition-colors ${
                filter === f
                  ? "bg-[var(--lg-accent)]/10 border-[var(--lg-accent)]/30 text-[var(--lg-accent)]"
                  : "bg-[var(--lg-tint)] border-[var(--lg-border-subtle)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Categories */}
        <div className="space-y-4">
          {filteredData!.categories.map(cat => {
            const isCollapsed = collapsed.has(cat.id);
            const cDone = cat.tasks.filter(t => t.status === "done").length;
            const cTotal = cat.tasks.length;

            // Hide empty categories when filtering
            if (filter !== "all" && cTotal === 0) return null;

            return (
              <div key={cat.id} className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl overflow-hidden">
                <button
                  onClick={() => setCollapsed(prev => {
                    const n = new Set(prev);
                    isCollapsed ? n.delete(cat.id) : n.add(cat.id);
                    return n;
                  })}
                  className="w-full p-4 hover:bg-[var(--lg-bg-card)] transition-colors text-left"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {isCollapsed ? <ChevronRight size={16} className="text-[var(--lg-text-muted)]" /> : <ChevronDown size={16} className="text-[var(--lg-text-muted)]" />}
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[var(--lg-text-heading)]">{cat.title}</h3>
                        <p className="text-xs text-[var(--lg-text-muted)] mt-0.5">{cat.description}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[var(--lg-text-muted)] tabular-nums shrink-0">{cDone}/{cTotal}</span>
                  </div>
                  {/* Full-width progress bar for this category */}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1 flex-1 bg-[var(--lg-border-faint)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${cTotal > 0 ? (cDone / cTotal) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-[var(--lg-text-muted)] tabular-nums shrink-0">
                      {cTotal > 0 ? Math.round((cDone / cTotal) * 100) : 0}%
                    </span>
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="border-t border-[var(--lg-border-faint)]">
                    {cat.tasks.map(todo => {
                      const cfg = STATUS_CONFIG[todo.status];
                      const Icon = cfg.icon;
                      const pcfg = PRIORITY_CONFIG[todo.priority || "p2"];
                      const isExpanded = expandedTodo === todo.id;
                      const isUpdating = updating.has(todo.id);
                      const hasLinks = !!(todo.roadmapLink || todo.conceptLink);

                      return (
                        <div key={todo.id} className="border-b border-[var(--lg-border-faint)] last:border-b-0">
                          <div className="flex items-center gap-3 px-4 py-3">
                            <button
                              onClick={() => toggleStatus(todo.id)}
                              disabled={isUpdating}
                              className={`flex-shrink-0 w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${cfg.bg} hover:opacity-80 disabled:opacity-50`}
                              title={`${cfg.label} → ${STATUS_CONFIG[NEXT_STATUS[todo.status]].label}`}
                            >
                              <Icon size={14} className={`${cfg.color} ${todo.status === "in_progress" ? "animate-spin" : ""}`} />
                            </button>

                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${pcfg.color} flex-shrink-0`}>
                              {pcfg.label}
                            </span>

                            <button
                              onClick={() => setExpandedTodo(isExpanded ? null : todo.id)}
                              className={`flex-1 text-left text-sm font-medium transition-colors ${todo.status === "done" ? "text-[var(--lg-text-muted)] line-through" : "text-[var(--lg-text-primary)]"}`}
                            >
                              {todo.title}
                            </button>

                            {todo.targetDate && (
                              <span className="text-[10px] text-[var(--lg-text-muted)] flex items-center gap-1 flex-shrink-0" title={`Target: ${todo.targetDate}`}>
                                <Calendar size={10} /> {todo.targetDate}
                              </span>
                            )}

                            {todo.owner && (
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border flex-shrink-0 ${
                                todo.owner === "jimmy"
                                  ? "text-blue-400 bg-blue-500/10 border-blue-500/20"
                                  : "text-purple-400 bg-purple-500/10 border-purple-500/20"
                              }`}>
                                {todo.owner}
                              </span>
                            )}
                          </div>

                          {isExpanded && (
                            <div className="px-4 pb-4 pl-[56px] space-y-3">
                              {todo.instructions && todo.instructions.length > 0 && (
                                <ol className="space-y-1.5">
                                  {todo.instructions.map((step, i) => (
                                    <li key={i} className="text-xs text-[var(--lg-text-muted)] flex items-start gap-2">
                                      <span className="text-[var(--lg-accent)] font-bold flex-shrink-0 w-5 text-right">{i + 1}.</span>
                                      <span>{step}</span>
                                    </li>
                                  ))}
                                </ol>
                              )}

                              {hasLinks && (
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  {todo.roadmapLink && (
                                    <Link
                                      to={todo.roadmapLink}
                                      className="text-[10px] font-bold uppercase px-2 py-1 rounded border text-sky-400 bg-sky-500/10 border-sky-500/30 hover:bg-sky-500/20 flex items-center gap-1"
                                    >
                                      <ExternalLink size={10} /> Roadmap
                                    </Link>
                                  )}
                                  {todo.conceptLink && (
                                    <Link
                                      to={todo.conceptLink}
                                      className="text-[10px] font-bold uppercase px-2 py-1 rounded border text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30 hover:bg-fuchsia-500/20 flex items-center gap-1"
                                    >
                                      <ExternalLink size={10} /> Concept
                                    </Link>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Add task */}
                    <div className="px-4 py-2">
                      {addingTo === cat.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addTodo(cat.id)}
                            placeholder="New todo title..."
                            className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-[var(--lg-bg)] border border-[var(--lg-border-subtle)] text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)] outline-none focus:border-[var(--lg-accent)]"
                            autoFocus
                          />
                          <button onClick={() => addTodo(cat.id)} className="text-xs font-bold text-[var(--lg-accent)] hover:underline">Add</button>
                          <button onClick={() => { setAddingTo(null); setNewTitle(""); }} className="text-xs text-[var(--lg-text-muted)] hover:underline">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingTo(cat.id)}
                          className="flex items-center gap-1.5 text-xs text-[var(--lg-text-muted)] hover:text-[var(--lg-accent)] transition-colors"
                        >
                          <Plus size={12} /> Add todo
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
