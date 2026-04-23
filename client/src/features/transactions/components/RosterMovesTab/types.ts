// Shared shape for the player rows consumed by the RosterMovesTab panels.
// Inherits from the loose PlayerSeasonStat-ish shape that ActivityPage
// already passes around — we don't re-narrow here because the source data
// mixes season-stat rows, roster rows, and free-agent pool rows.
export interface RosterMovesPlayer {
  player_name?: string;
  name?: string;
  mlb_id?: string | number;
  mlbId?: string | number;
  _dbPlayerId?: number;
  _dbTeamId?: number;
  assignedPosition?: string;
  posPrimary?: string;
  positions?: string;
  mlbStatus?: string;
  ogba_team_code?: string;
  team?: string;
  is_pitcher?: boolean | number;
}

export type RosterMovesMode = "add-drop" | "place-il" | "activate-il";

export const MODES: RosterMovesMode[] = ["add-drop", "place-il", "activate-il"];

export const MODE_LABEL: Record<RosterMovesMode, string> = {
  "add-drop": "Add / Drop",
  "place-il": "Place on IL",
  "activate-il": "Activate from IL",
};
