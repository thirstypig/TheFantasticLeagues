import type { HubPeriod, UnbilledPeriod } from "../api";

export interface NeedsYouItem {
  key: string;
  kind: "start" | "close" | "roster" | "trade" | "bill";
  title: string;
  detail: string;
  /** Path relative to /commissioner/:leagueId */
  to: string;
  urgent: boolean;
}

export interface NeedsYouInput {
  periods: HubPeriod[];
  ghostIlTotal: number;
  teamsOverCap: number;
  acceptedTrades: number;
  unbilled: UnbilledPeriod[];
  now: Date;
}

const DAY_MS = 86_400_000;

function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function deriveNeedsYou({
  periods,
  ghostIlTotal,
  teamsOverCap,
  acceptedTrades,
  unbilled,
  now,
}: NeedsYouInput): NeedsYouItem[] {
  const today = utcDay(now);
  const active = periods.filter((p) => p.status === "active");
  // An active period still running (end date today or later) blocks starting the next one.
  const activeStillRunning = active.some((p) => utcDay(new Date(p.endDate)) >= today);

  const start: NeedsYouItem[] = [];
  if (!activeStillRunning) {
    for (const p of periods) {
      if (p.status !== "pending") continue;
      const daysLate = Math.round((today - utcDay(new Date(p.startDate))) / DAY_MS);
      if (daysLate < 0) continue;
      start.push({
        key: `start-${p.id}`,
        kind: "start",
        title: daysLate === 0 ? `Start ${p.name} · today` : `Start ${p.name} · ${daysLate} days late`,
        detail: "Review rosters, then activate the period.",
        to: `start/${p.id}`,
        urgent: true,
      });
    }
  }

  // Same threshold as the server's close-readiness endpoint: 13:00 UTC the day
  // after the end date (final-day stat sync has landed).
  const close: NeedsYouItem[] = active
    .filter((p) => {
      const e = new Date(p.endDate);
      return now.getTime() >= Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate() + 1, 13);
    })
    .map((p) => ({
      key: `close-${p.id}`,
      kind: "close" as const,
      title: `Close ${p.name}`,
      detail: "The period has ended and its final stats are in.",
      to: `close/${p.id}`,
      urgent: false,
    }));

  const bill: NeedsYouItem[] = unbilled.map((u) => ({
    key: `bill-${u.periodId}`,
    kind: "bill" as const,
    title: `Bill IL fees · period ${u.periodId}`,
    detail: "Closed without billing IL fees.",
    to: "money",
    urgent: false,
  }));

  const out: NeedsYouItem[] = [...start, ...close, ...bill];

  const rosterIssues = ghostIlTotal + teamsOverCap;
  if (rosterIssues > 0) {
    out.push({
      key: "roster",
      kind: "roster",
      title: "Roster problems",
      detail: `${ghostIlTotal} IL ghost${ghostIlTotal === 1 ? "" : "s"}, ${teamsOverCap} team${teamsOverCap === 1 ? "" : "s"} over the cap.`,
      to: "rosters",
      urgent: false,
    });
  }
  if (acceptedTrades > 0) {
    out.push({
      key: "trade",
      kind: "trade",
      title: `${acceptedTrades} accepted trade${acceptedTrades === 1 ? "" : "s"}`,
      detail: "Accepted trades are waiting on commissioner action.",
      to: "trades",
      urgent: false,
    });
  }
  return out;
}
