import type { HubPeriod, RecentChange } from "../api";

function periodLabel(c: RecentChange, periods: HubPeriod[]): string {
  const raw = c.metadata?.periodId ?? c.resourceId;
  const id = raw === null || raw === undefined ? null : Number(raw);
  const found = id !== null ? periods.find((p) => p.id === id) : undefined;
  if (found) return found.name;
  return id !== null && !Number.isNaN(id) ? `#${id}` : "a period";
}

function sentenceCase(action: string): string {
  const s = action.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Human copy for a commissioner audit-log row. */
export function describeChange(c: RecentChange, periods: HubPeriod[]): string {
  switch (c.action) {
    case "PERIOD_CLOSE":
      return `Closed ${periodLabel(c, periods)} (${c.metadata?.billed === true ? "fees billed" : "bill later"})`;
    case "PERIOD_START":
      return `Started ${periodLabel(c, periods)}`;
    case "IL_FEE_RECONCILE":
      return `Billed IL fees for ${periodLabel(c, periods)}`;
    case "TRADE_PROCESS":
      return `Processed trade #${c.resourceId ?? "?"}`;
    default:
      return sentenceCase(c.action);
  }
}
