#!/usr/bin/env python3
"""
build_ogba_player_career_totals.py

Reads ogba_player_season_totals_2025_with_meta.csv, fetches MLB career stats
for each unique mlb_id via statsapi.player_stat_data, and writes a flat CSV:

  ogba_player_career_totals_mlb.csv

Hitters: G, AB, R, H, HR, RBI, SB, AVG, OBP, SLG, OPS
Pitchers: G, GS, W, L, SV, K, IP, ERA, WHIP, CG, SHO
"""

import csv
import os
from collections import OrderedDict
from typing import Dict, List, Any, Optional

import statsapi  # type: ignore

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
SEASON_CSV = os.path.join(ROOT_DIR, "ogba_player_season_totals_2025_with_meta.csv")
OUT_CSV = os.path.join(ROOT_DIR, "ogba_player_career_totals_mlb.csv")


def load_unique_players() -> "OrderedDict[str, Dict[str, Any]]":
    """
    Return an OrderedDict keyed by mlb_id, with the first row for that id.
    """
    players_by_id: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
    with open(SEASON_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            mlb_id = (row.get("mlb_id") or "").strip()
            if not mlb_id:
                continue
            if mlb_id in players_by_id:
                continue
            players_by_id[mlb_id] = row
    return players_by_id


def fetch_career_for_player(mlb_id: str, group: str) -> Optional[Dict[str, Any]]:
    """
    Use statsapi.player_stat_data(...) which returns a dict with a 'stats' list.
    We call type='career', so the first item in that list should be the career line.
    """
    try:
        data = statsapi.player_stat_data(mlb_id, group, "career")
    except Exception as exc:  # network / API error
        print(f"[ERROR] statsapi.player_stat_data failed for {mlb_id}: {exc}")
        return None

    stats_groups: List[Dict[str, Any]] = data.get("stats", []) or []
    if not stats_groups:
        return None

    first_group = stats_groups[0]
    stats = first_group.get("stats") or {}
    if not isinstance(stats, dict) or not stats:
        return None

    return stats


def build_career_rows(players_by_id: "OrderedDict[str, Dict[str, Any]]") -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []

    total = len(players_by_id)
    for idx, (mlb_id, row) in enumerate(players_by_id.items(), start=1):
        full_name = (row.get("mlb_full_name") or row.get("player_name") or "").strip()
        is_pitcher_raw = (row.get("is_pitcher") or "").strip()
        is_pitcher = is_pitcher_raw in ("1", "true", "True", "Y", "y")

        group = "pitching" if is_pitcher else "hitting"
        label_name = full_name or mlb_id

        print(f"[{idx}/{total}] Fetching {group} career stats for {label_name} ({mlb_id})...")

        stats = fetch_career_for_player(mlb_id, group)
        if not stats:
            print(f"[WARN] No career stats returned for {label_name} ({mlb_id})")
            continue

        if group == "hitting":
            row_out: Dict[str, Any] = {
                "mlb_id": mlb_id,
                "mlb_full_name": full_name,
                "is_pitcher": "0",
                "career_group": "H",
                "career_G": stats.get("gamesPlayed"),
                "career_AB": stats.get("atBats"),
                "career_R": stats.get("runs"),
                "career_H": stats.get("hits"),
                "career_HR": stats.get("homeRuns"),
                "career_RBI": stats.get("rbi"),
                "career_SB": stats.get("stolenBases"),
                "career_AVG": stats.get("avg"),
                "career_OBP": stats.get("obp"),
                "career_SLG": stats.get("slg"),
                "career_OPS": stats.get("ops"),
                # Pitcher-only fields left blank for hitters
                "career_GS": "",
                "career_W": "",
                "career_L": "",
                "career_SV": "",
                "career_K": "",
                "career_IP": "",
                "career_ERA": "",
                "career_WHIP": "",
                "career_CG": "",
                "career_SHO": "",
            }
        else:
            row_out = {
                "mlb_id": mlb_id,
                "mlb_full_name": full_name,
                "is_pitcher": "1",
                "career_group": "P",
                # Shared / pitcher-appropriate fields
                "career_G": stats.get("gamesPlayed"),
                # Hitting fields left blank for pitchers
                "career_AB": "",
                "career_R": "",
                "career_H": "",
                "career_HR": "",
                "career_RBI": "",
                "career_SB": "",
                "career_AVG": "",
                "career_OBP": "",
                "career_SLG": "",
                "career_OPS": "",
                # Pitching fields
                "career_GS": stats.get("gamesStarted"),
                "career_W": stats.get("wins"),
                "career_L": stats.get("losses"),
                "career_SV": stats.get("saves"),
                "career_K": stats.get("strikeOuts"),
                "career_IP": stats.get("inningsPitched"),
                "career_ERA": stats.get("era"),
                "career_WHIP": stats.get("whip"),
                "career_CG": stats.get("completeGames"),
                "career_SHO": stats.get("shutouts"),
            }

        rows.append(row_out)

    return rows


def main() -> None:
    print(f"Loading players from {SEASON_CSV}...")
    players_by_id = load_unique_players()
    print(f"Found {len(players_by_id)} unique players with mlb_id")

    rows = build_career_rows(players_by_id)
    print(f"Fetched career stats for {len(rows)} players")

    fieldnames = [
        "mlb_id",
        "mlb_full_name",
        "is_pitcher",
        "career_group",
        "career_G",
        "career_AB",
        "career_R",
        "career_H",
        "career_HR",
        "career_RBI",
        "career_SB",
        "career_AVG",
        "career_OBP",
        "career_SLG",
        "career_OPS",
        "career_GS",
        "career_W",
        "career_L",
        "career_SV",
        "career_K",
        "career_IP",
        "career_ERA",
        "career_WHIP",
        "career_CG",
        "career_SHO",
    ]

    print(f"Writing {len(rows)} rows to {OUT_CSV}...")
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)

    print("Done.")


if __name__ == "__main__":
    main()
