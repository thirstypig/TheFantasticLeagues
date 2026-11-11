// A trade being built is kept in the browser so it survives a reload and
// outside-the-window building. Nothing is scheduled on the server.
export type TradeDraft = {
  leagueId: number;
  partnerId: number | null;
  give: number[];
  get: number[];
  giveDollars: number;
  getDollars: number;
};

const key = (leagueId: number) => `fbst.tradeDraft.v1.${leagueId}`;

const isIds = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => typeof n === "number");

export function loadTradeDraft(leagueId: number): TradeDraft | null {
  try {
    const raw = localStorage.getItem(key(leagueId));
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (
      !d || typeof d !== "object" ||
      d.leagueId !== leagueId ||
      !(d.partnerId === null || typeof d.partnerId === "number") ||
      !isIds(d.give) || !isIds(d.get) ||
      typeof d.giveDollars !== "number" || typeof d.getDollars !== "number"
    ) return null;
    return d as TradeDraft;
  } catch {
    return null;
  }
}

export function saveTradeDraft(draft: TradeDraft): void {
  try {
    localStorage.setItem(key(draft.leagueId), JSON.stringify(draft));
  } catch {
    /* storage unavailable: the draft just won't persist */
  }
}

export function clearTradeDraft(leagueId: number): void {
  try {
    localStorage.removeItem(key(leagueId));
  } catch {
    /* ignore */
  }
}
