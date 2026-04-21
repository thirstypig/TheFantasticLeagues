#!/usr/bin/env python3
"""
build_ogba_auction_values.py

Reads ogba_player_period_totals_2025.csv (per-player per-period totals),
aggregates per-player season totals, then computes simple z-score based
auction values separately for hitters and pitchers.

Outputs:
  - ogba_player_season_totals_2025.csv
  - ogba_auction_values_2025.csv
"""

from __future__ import annotations

import csv
import math
from dataclasses import dataclass
from typing import Dict, Tuple, List, Any
from collections import defaultdict

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Auction configuration (tweak as needed)
NUM_TEAMS = 8
BUDGET_PER_TEAM = 260
TOTAL_BUDGET = NUM_TEAMS * BUDGET_PER_TEAM

# Split hitters vs pitchers budget (70/30 is fairly standard)
HITTING_SHARE = 0.7
PITCHING_SHARE = 0.3

HITTING_BUDGET = TOTAL_BUDGET * HITTING_SHARE
PITCHING_BUDGET = TOTAL_BUDGET * PITCHING_SHARE


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class PlayerSeasonTotals:
    mlb_id: int
    player_name: str
    ogba_team_code: str
    positions: str
    is_pitcher: bool

    # counting stats
    R: int = 0
    HR: int = 0
    RBI: int = 0
    SB: int = 0
    H: int = 0
    AB: int = 0

    W: int = 0
    SV: int = 0
    K: int = 0
    ER: int = 0
    IP: float = 0.0
    BB_H: int = 0  # walks + hits

    # derived
    AVG: float = 0.0
    ERA: float = 0.0
    WHIP: float = 0.0

    def compute_rates(self) -> None:
        if self.AB > 0:
            self.AVG = self.H / self.AB
        else:
            self.AVG = 0.0

        if self.IP > 0:
            self.ERA = (self.ER * 9.0) / self.IP
            self.WHIP = self.BB_H / self.IP
        else:
            self.ERA = 0.0
            self.WHIP = 0.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def try_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def try_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def infer_is_pitcher(row: Dict[str, str]) -> bool:
    """
    Decide if a player is a pitcher. We try in this order:
      1) explicit 'is_pitcher' column, if present
      2) positions column containing P/SP/RP
      3) default False
    """
    raw_flag = row.get("is_pitcher")
    if raw_flag is not None:
        val = raw_flag.strip().lower()
        if val in ("1", "true", "yes", "y"):
            return True
        if val in ("0", "false", "no", "n"):
            return False

    positions = (row.get("positions") or row.get("position") or "").upper()
    if any(p in positions.split("/") for p in ("P", "SP", "RP")):
        return True

    return False


def aggregate_player_season_totals(
    in_path: str = "ogba_player_period_totals_2025.csv",
) -> Dict[Tuple[int, str], PlayerSeasonTotals]:
    """
    Read per-player per-period totals and aggregate across all periods.
    """
    players: Dict[Tuple[int, str], PlayerSeasonTotals] = {}

    with open(in_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            mlb_id = try_int(row.get("mlb_id"))
            if mlb_id == 0:
                # skip if we can't identify the player
                continue

            player_name = (row.get("player_name") or row.get("name") or "").strip()
            if not player_name:
                continue

            key = (mlb_id, player_name)

            ogba_team_code = (row.get("ogba_team_code") or
                              row.get("team_code") or
                              row.get("team") or "").strip()
            positions = (row.get("positions") or row.get("position") or "").strip()
            is_pitcher = infer_is_pitcher(row)

            if key not in players:
                players[key] = PlayerSeasonTotals(
                    mlb_id=mlb_id,
                    player_name=player_name,
                    ogba_team_code=ogba_team_code,
                    positions=positions,
                    is_pitcher=is_pitcher,
                )
            else:
                # Update team code / positions if missing before
                if not players[key].ogba_team_code and ogba_team_code:
                    players[key].ogba_team_code = ogba_team_code
                if not players[key].positions and positions:
                    players[key].positions = positions

            p = players[key]

            # Aggregate counting stats if present
            p.R += try_int(row.get("R"))
            p.HR += try_int(row.get("HR"))
            p.RBI += try_int(row.get("RBI"))
            p.SB += try_int(row.get("SB"))
            p.H += try_int(row.get("H"))
            p.AB += try_int(row.get("AB"))

            p.W += try_int(row.get("W"))
            p.SV += try_int(row.get("SV"))
            p.K += try_int(row.get("K"))
            p.ER += try_int(row.get("ER"))
            p.IP += try_float(row.get("IP"))
            p.BB_H += try_int(row.get("BB_H"))

    # Compute rate stats
    for p in players.values():
        p.compute_rates()

    return players


def write_player_season_totals(
    players: Dict[Tuple[int, str], PlayerSeasonTotals],
    out_path: str = "ogba_player_season_totals_2025.csv",
) -> None:
    fieldnames = [
        "mlb_id",
        "player_name",
        "ogba_team_code",
        "positions",
        "is_pitcher",
        "R",
        "HR",
        "RBI",
        "SB",
        "H",
        "AB",
        "AVG",
        "W",
        "SV",
        "K",
        "ER",
        "IP",
        "ERA",
        "BB_H",
        "WHIP",
    ]

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for p in players.values():
            row = {
                "mlb_id": p.mlb_id,
                "player_name": p.player_name,
                "ogba_team_code": p.ogba_team_code,
                "positions": p.positions,
                "is_pitcher": int(p.is_pitcher),
                "R": p.R,
                "HR": p.HR,
                "RBI": p.RBI,
                "SB": p.SB,
                "H": p.H,
                "AB": p.AB,
                "AVG": round(p.AVG, 3),
                "W": p.W,
                "SV": p.SV,
                "K": p.K,
                "ER": p.ER,
                "IP": round(p.IP, 2),
                "ERA": round(p.ERA, 2),
                "BB_H": p.BB_H,
                "WHIP": round(p.WHIP, 2),
            }
            writer.writerow(row)

    print(f"Wrote {len(players)} players to {out_path}")


# ---------------------------------------------------------------------------
# Z-score and auction value calculations
# ---------------------------------------------------------------------------


def compute_mean_std(values: List[float]) -> Tuple[float, float]:
    if not values:
        return 0.0, 0.0
    n = len(values)
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / n
    std = math.sqrt(var)
    return mean, std


def z_scores_for_category(
    players: List[PlayerSeasonTotals],
    attr: str,
    invert: bool = False,
) -> Dict[Tuple[int, str], float]:
    """
    Compute z-scores for a given numeric attribute of PlayerSeasonTotals.

    If invert=True, lower is better (e.g., ERA, WHIP). We implement that by
    z-scoring the negative of the value.
    """
    vals: List[float] = []
    keys: List[Tuple[int, str]] = []

    for p in players:
        value = getattr(p, attr, 0.0)
        if invert:
            value = -value
        vals.append(value)
        keys.append((p.mlb_id, p.player_name))

    mean, std = compute_mean_std(vals)
    zmap: Dict[Tuple[int, str], float] = {}
    if std == 0:
        for key in keys:
            zmap[key] = 0.0
    else:
        for key, value in zip(keys, vals):
            zmap[key] = (value - mean) / std

    return zmap


def build_auction_values(
    players: Dict[Tuple[int, str], PlayerSeasonTotals],
    out_path: str = "ogba_auction_values_2025.csv",
) -> None:
    hitters = [p for p in players.values() if not p.is_pitcher]
    pitchers = [p for p in players.values() if p.is_pitcher]

    # --- Hitters: categories R, HR, RBI, SB, AVG ---
    h_cats = ["R", "HR", "RBI", "SB", "AVG"]
    h_invert = {"R": False, "HR": False, "RBI": False, "SB": False, "AVG": False}

    h_zmaps: Dict[str, Dict[Tuple[int, str], float]] = {}
    for cat in h_cats:
        h_zmaps[cat] = z_scores_for_category(hitters, cat, invert=h_invert[cat])

    # total hitter z for each player
    hitter_total_z: Dict[Tuple[int, str], float] = defaultdict(float)
    for cat in h_cats:
        for key, z in h_zmaps[cat].items():
            hitter_total_z[key] += z

    # Shift and scale z-sums into dollar values
    h_values: Dict[Tuple[int, str], float] = {}
    if hitters:
        z_min = min(hitter_total_z.values())
        z_shifted = {k: v - z_min for k, v in hitter_total_z.items()}
        sum_shifted = sum(z_shifted.values())
        if sum_shifted > 0:
            for key, zs in z_shifted.items():
                h_values[key] = HITTING_BUDGET * (zs / sum_shifted)
        else:
            for p in hitters:
                h_values[(p.mlb_id, p.player_name)] = 0.0

    # --- Pitchers: categories W, SV, K, ERA, WHIP (ERA/WHIP lower is better) ---
    p_cats = ["W", "SV", "K", "ERA", "WHIP"]
    p_invert = {"W": False, "SV": False, "K": False, "ERA": True, "WHIP": True}

    p_zmaps: Dict[str, Dict[Tuple[int, str], float]] = {}
    for cat in p_cats:
        p_zmaps[cat] = z_scores_for_category(pitchers, cat, invert=p_invert[cat])

    pitcher_total_z: Dict[Tuple[int, str], float] = defaultdict(float)
    for cat in p_cats:
        for key, z in p_zmaps[cat].items():
            pitcher_total_z[key] += z

    p_values: Dict[Tuple[int, str], float] = {}
    if pitchers:
        z_min = min(pitcher_total_z.values())
        z_shifted = {k: v - z_min for k, v in pitcher_total_z.items()}
        sum_shifted = sum(z_shifted.values())
        if sum_shifted > 0:
            for key, zs in z_shifted.items():
                p_values[key] = PITCHING_BUDGET * (zs / sum_shifted)
        else:
            for p in pitchers:
                p_values[(p.mlb_id, p.player_name)] = 0.0

    # --- Write combined CSV ---
    fieldnames = [
        "mlb_id",
        "player_name",
        "ogba_team_code",
        "positions",
        "is_pitcher",
        "group",  # H or P
        "R",
        "HR",
        "RBI",
        "SB",
        "H",
        "AB",
        "AVG",
        "W",
        "SV",
        "K",
        "ER",
        "IP",
        "ERA",
        "BB_H",
        "WHIP",
        # z-sum and value
        "z_total",
        "dollar_value",
    ]

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for p in hitters:
            key = (p.mlb_id, p.player_name)
            z_sum = hitter_total_z.get(key, 0.0)
            value = h_values.get(key, 0.0)
            row = {
                "mlb_id": p.mlb_id,
                "player_name": p.player_name,
                "ogba_team_code": p.ogba_team_code,
                "positions": p.positions,
                "is_pitcher": 0,
                "group": "H",
                "R": p.R,
                "HR": p.HR,
                "RBI": p.RBI,
                "SB": p.SB,
                "H": p.H,
                "AB": p.AB,
                "AVG": round(p.AVG, 3),
                "W": p.W,
                "SV": p.SV,
                "K": p.K,
                "ER": p.ER,
                "IP": round(p.IP, 2),
                "ERA": round(p.ERA, 2),
                "BB_H": p.BB_H,
                "WHIP": round(p.WHIP, 2),
                "z_total": round(z_sum, 3),
                "dollar_value": round(value, 1),
            }
            writer.writerow(row)

        for p in pitchers:
            key = (p.mlb_id, p.player_name)
            z_sum = pitcher_total_z.get(key, 0.0)
            value = p_values.get(key, 0.0)
            row = {
                "mlb_id": p.mlb_id,
                "player_name": p.player_name,
                "ogba_team_code": p.ogba_team_code,
                "positions": p.positions,
                "is_pitcher": 1,
                "group": "P",
                "R": p.R,
                "HR": p.HR,
                "RBI": p.RBI,
                "SB": p.SB,
                "H": p.H,
                "AB": p.AB,
                "AVG": round(p.AVG, 3),
                "W": p.W,
                "SV": p.SV,
                "K": p.K,
                "ER": p.ER,
                "IP": round(p.IP, 2),
                "ERA": round(p.ERA, 2),
                "BB_H": p.BB_H,
                "WHIP": round(p.WHIP, 2),
                "z_total": round(z_sum, 3),
                "dollar_value": round(value, 1),
            }
            writer.writerow(row)

    print(f"Wrote {len(hitters) + len(pitchers)} players with auction values to {out_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    players = aggregate_player_season_totals()
    if not players:
        print("No players aggregated. Check ogba_player_period_totals_2025.csv.")
        return

    write_player_season_totals(players)
    build_auction_values(players)


if __name__ == "__main__":
    main()
