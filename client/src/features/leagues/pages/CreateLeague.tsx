import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, Copy, Check } from "lucide-react";
import { Button } from "../../../components/ui/button";
import PageHeader from "../../../components/ui/PageHeader";
import { useToast } from "../../../contexts/ToastContext";
import { createLeague, type CreateLeagueInput } from "../api";

export default function CreateLeague() {
  const nav = useNavigate();
  const { toast } = useToast();

  const [form, setForm] = useState<CreateLeagueInput & { scoringFormat: string }>({
    name: "",
    season: new Date().getFullYear(),
    leagueType: "NL",
    draftMode: "AUCTION",
    isPublic: false,
    scoringFormat: "ROTO",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ leagueId: number; inviteCode: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast("League name is required", "error"); return; }
    setSubmitting(true);
    try {
      const res = await createLeague(form);
      setResult({ leagueId: res.league.id, inviteCode: res.inviteCode });
      toast("League created!", "success");
    } catch (err) {
      toast((err as Error)?.message || "Failed to create league", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const copyInviteCode = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (result) {
    return (
      <div className="max-w-xl mx-auto px-4 py-6 md:px-6 md:py-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <Trophy size={32} className="text-emerald-500" />
          </div>
          <h1 className="text-2xl font-semibold text-[var(--lg-text-heading)] mb-2">League Created!</h1>
          <p className="text-sm text-[var(--lg-text-muted)]">Share the invite code below with your league members.</p>
        </div>

        <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-6 mb-6">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">Invite Code</div>
          <div className="flex items-center gap-3">
            <code className="flex-1 px-4 py-3 rounded-xl bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)] text-sm font-mono font-bold text-[var(--lg-text-primary)] tracking-wider select-all">
              {result.inviteCode}
            </code>
            <Button variant="outline" size="sm" onClick={copyInviteCode}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>

        {/* Setup Checklist */}
        <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-6 mb-6">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mb-3">Next Steps</div>
          <div className="space-y-2">
            {[
              { done: true, label: "Create league" },
              { done: false, label: "Invite members (share code above)" },
              { done: false, label: "Configure rules & roster settings" },
              { done: false, label: "Start the draft" },
            ].map(step => (
              <div key={step.label} className="flex items-center gap-2.5 text-xs">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                  step.done ? "bg-emerald-500/20 text-emerald-500" : "border border-[var(--lg-border-faint)] text-[var(--lg-text-muted)]"
                }`}>
                  {step.done ? <Check size={10} /> : <span className="w-1.5 h-1.5 rounded-full bg-current opacity-30" />}
                </span>
                <span className={step.done ? "text-[var(--lg-text-muted)] line-through" : "text-[var(--lg-text-primary)]"}>{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 justify-center">
          <Button onClick={() => nav(`/commissioner/${result.leagueId}`)}>
            Set Up League
          </Button>
          <Button variant="outline" onClick={() => nav("/")}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <PageHeader title="Create a League" subtitle="Set up a new fantasy league. You'll be the commissioner." />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* League Info */}
        <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5 space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)]">League Info</div>

          <div>
            <label className="block text-xs font-medium text-[var(--lg-text-secondary)] mb-1">League Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g., OGBA Fantasy Baseball"
              className="w-full h-10 px-3 rounded-xl bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)] text-sm text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)] outline-none focus:border-[var(--lg-accent)] transition-colors"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--lg-text-secondary)] mb-1">Season Year</label>
              <input
                type="number"
                value={form.season}
                onChange={e => setForm(f => ({ ...f, season: Number(e.target.value) }))}
                min={2020}
                max={2100}
                className="w-full h-10 px-3 rounded-xl bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)] text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--lg-text-secondary)] mb-1">League Type</label>
              <select
                value={form.leagueType}
                onChange={e => setForm(f => ({ ...f, leagueType: e.target.value as "NL" | "AL" | "MIXED" }))}
                className="w-full h-10 px-3 rounded-xl bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)] text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-colors cursor-pointer"
              >
                <option value="NL">NL Only</option>
                <option value="AL">AL Only</option>
                <option value="MIXED">Mixed (Both Leagues)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scoring Format */}
        <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5 space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)]">Scoring Format</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              { id: "ROTO", name: "Rotisserie", desc: "Season-long stats across 10 categories. Classic format.", available: true },
              { id: "H2H_CATEGORIES", name: "H2H Categories", desc: "Weekly matchups — win more categories than your opponent.", available: false },
              { id: "H2H_POINTS", name: "H2H Points", desc: "Weekly matchups — highest total points wins each week.", available: false },
            ] as const).map(fmt => (
              <button
                key={fmt.id}
                type="button"
                onClick={() => fmt.available && setForm(f => ({ ...f, scoringFormat: fmt.id }))}
                disabled={!fmt.available}
                className={`p-3 rounded-xl border text-left transition-colors relative ${
                  !fmt.available
                    ? "border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] opacity-50 cursor-not-allowed"
                    : form.scoringFormat === fmt.id
                      ? "border-[var(--lg-accent)] bg-[var(--lg-accent)]/10 text-[var(--lg-accent)]"
                      : "border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] text-[var(--lg-text-muted)] hover:border-[var(--lg-accent)]/30"
                }`}
              >
                <div className="text-sm font-semibold">{fmt.name}</div>
                <div className="text-[10px] mt-0.5 opacity-70">{fmt.desc}</div>
                {!fmt.available && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">Planned</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Draft Type */}
        <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5 space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)]">Draft Type</div>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: "AUCTION" as const, name: "Auction Draft", desc: "Budget-based bidding on all players. Most strategic.", available: true },
              { id: "DRAFT" as const, name: "Snake Draft", desc: "Turn-based picks. Order reverses each round.", available: false },
            ]).map(dt => (
              <button
                key={dt.id}
                type="button"
                onClick={() => dt.available && setForm(f => ({ ...f, draftMode: dt.id }))}
                disabled={!dt.available}
                className={`p-3 rounded-xl border text-left transition-colors relative ${
                  !dt.available
                    ? "border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] opacity-50 cursor-not-allowed"
                    : form.draftMode === dt.id
                      ? "border-[var(--lg-accent)] bg-[var(--lg-accent)]/10 text-[var(--lg-accent)]"
                      : "border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] text-[var(--lg-text-muted)] hover:border-[var(--lg-accent)]/30"
                }`}
              >
                <div className="text-sm font-semibold">{dt.name}</div>
                <div className="text-[10px] mt-0.5 opacity-70">{dt.desc}</div>
                {!dt.available && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">Planned</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={submitting || !form.name.trim()}>
          {submitting ? "Creating..." : "Create League"}
        </Button>
      </form>
    </div>
  );
}
