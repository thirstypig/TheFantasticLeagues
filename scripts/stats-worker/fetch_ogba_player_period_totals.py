#!/usr/bin/env python3
"""
Fetch OGBA per-player period totals from MLB Stats API.

Inputs:
  - ogba_periods_2025.json
  - roster_ogba_2025.csv

Output:
  - ogba_player_period_totals_2025.csv

Each row is: period + team + player with 5x5-style stats and rate stats.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from typing import List, Dict, Any
import requests

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class Period:
    id: str
    label: str
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD


@dataclass
class RosterEntry:
    ogba_team_code: str
    player_name: str
    mlb_id: int
    positions: List[str]
    is_pitcher: bool


TEAM_NAMES: Dict[str, str] = {
    "DDG": "Dodger Dawgs",
    "DLC": "Demolition Lumber Co.",
    "DMK": "Diamond Kings",
    "DVD": "Devil Dawgs",
    "LDY": "Los Doyers",
    "RGS": "RGing Sluggers",
    "SKD": "Skunk Dogs",
    "TSH": "The Show",
}

MLB_STATS_BASE = "https://statsapi.mlb.com/api/v1"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def parse_innings(ip_str: str) -> float:
    """
    Convert MLB innings string (e.g. '12.1', '5.2') into decimal innings.
    .0 = 0/3, .1 = 1/3, .2 = 2/3
    """
    if not ip_str:
        return 0.0
    ip_str = ip_str.strip()
    if not ip_str or ip_str == "0.0":
        return 0.0

    if "." not in ip_str:
        try:
            return float(int(ip_str))
        except ValueError:
            return 0.0

    whole_str, frac_str = ip_str.split(".", 1)
    try:
        whole = int(whole_str)
    except ValueError:
        whole = 0

    try:
        frac = int(frac_str)
    except ValueError:
        frac = 0

    if frac not in (0, 1, 2):
        frac = 0

    return whole + frac / 3.0


def load_periods(path: str = "ogba_periods_2025.json") -> List[Period]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except FileNotFoundError:
        print(f"No periods loaded. Missing {path}.")
        return []
    except json.JSONDecodeError as e:
        print(f"No periods loaded. JSON error in {path}: {e}")
        return []

    periods: List[Period] = []
    for item in raw:
        pid = str(item.get("id", "")).strip()
        label = str(item.get("label", "")).strip() or pid

        # Support both snake_case and camelCase keys
        start = (
            item.get("start_date")
            or item.get("startDate")
            or item.get("start")
            or item.get("from")
        )
        end = (
            item.get("end_date")
            or item.get("endDate")
            or item.get("end")
            or item.get("to")
        )

        if not (pid and start and end):
            print(f"[WARN] Skipping malformed period entry: {item}")
            continue

        periods.append(Period(id=pid, label=label, start_date=start, end_date=end))

    print(f"Loaded {len(periods)} periods from {path}")
    return periods


def load_roster(path: str = "roster_ogba_2025.csv") -> List[RosterEntry]:
    entries: List[RosterEntry] = []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        total_rows = 0
        skipped_no_id = 0

        for row in reader:
            total_rows += 1
            mlb_id_raw = (row.get("mlb_id") or "").strip()
            if not mlb_id_raw:
                skipped_no_id += 1
                continue

            try:
                mlb_id = int(mlb_id_raw)
            except ValueError:
                skipped_no_id += 1
                continue

            ogba_team_code = (
                row.get("ogba_team_code")
                or row.get("team")
                or row.get("team_code")
                or ""
            ).strip()

            if not ogba_team_code:
                skipped_no_id += 1
                continue

            player_name = (row.get("player_name") or row.get("name") or "").strip()

            pos_field = (row.get("positions") or row.get("position") or "").strip()
            positions = [
                p.strip()
                for p in pos_field.replace(",", "/").split("/")
                if p.strip()
            ]

            upper_positions = [p.upper() for p in positions]
            is_pitcher = any(p in ("P", "SP", "RP") for p in upper_positions)

            entries.append(
                RosterEntry(
                    ogba_team_code=ogba_team_code,
                    player_name=player_name,
                    mlb_id=mlb_id,
                    positions=positions,
                    is_pitcher=is_pitcher,
                )
            )

    print(
        f"Loaded {len(entries)} roster entries with mlb_id, skipped "
        f"{skipped_no_id} without mlb_id."
    )
    return entries


# ---------------------------------------------------------------------------
# MLB Stats fetchers
# ---------------------------------------------------------------------------


def fetch_hitting_stats(entry: RosterEntry, start_date: str, end_date: str) -> Dict[str, Any]:
    """
    Fetch cumulative hitting stats for a player in a date range.

    Returns dict with keys: R, HR, RBI, SB, H, AB
    """
    url = f"{MLB_STATS_BASE}/people/{entry.mlb_id}/stats"
    params = {
        "stats": "byDateRange",
        "group": "hitting",
        "startDate": start_date,
        "endDate": end_date,
        "gameType": "R",
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        stats_list = data.get("stats", [])
        if not stats_list:
            return {"R": 0, "HR": 0, "RBI": 0, "SB": 0, "H": 0, "AB": 0}

        splits = stats_list[0].get("splits", [])
        if not splits:
            return {"R": 0, "HR": 0, "RBI": 0, "SB": 0, "H": 0, "AB": 0}

        stat = splits[0].get("stat", {})

        runs = int(stat.get("runs", 0))
        hr = int(stat.get("homeRuns", 0))
        rbi = int(stat.get("rbi", 0))
        sb = int(stat.get("stolenBases", 0))
        hits = int(stat.get("hits", 0))
        ab = int(stat.get("atBats", 0))

        return {"R": runs, "HR": hr, "RBI": rbi, "SB": sb, "H": hits, "AB": ab}
    except Exception as e:
        print(
            f"  [WARN] stats lookup failed for {entry.player_name} "
            f"({entry.mlb_id}) [hitting]: {e}"
        )
        return {"R": 0, "HR": 0, "RBI": 0, "SB": 0, "H": 0, "AB": 0}


def fetch_pitching_stats(entry: RosterEntry, start_date: str, end_date: str) -> Dict[str, Any]:
    """
    Fetch cumulative pitching stats for a player in a date range.

    Returns dict with keys: W, SV, K, ER, IP, BB_H
      - BB_H = walks + hits (for WHIP)
    """
    url = f"{MLB_STATS_BASE}/people/{entry.mlb_id}/stats"
    params = {
        "stats": "byDateRange",
        "group": "pitching",
        "startDate": start_date,
        "endDate": end_date,
        "gameType": "R",
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        stats_list = data.get("stats", [])
        if not stats_list:
            return {"W": 0, "SV": 0, "K": 0, "ER": 0, "IP": 0.0, "BB_H": 0}

        splits = stats_list[0].get("splits", [])
        if not splits:
            return {"W": 0, "SV": 0, "K": 0, "ER": 0, "IP": 0.0, "BB_H": 0}

        stat = splits[0].get("stat", {})

        wins = int(stat.get("wins", 0))
        saves = int(stat.get("saves", 0))
        strikeouts = int(stat.get("strikeOuts", 0))
        er = int(stat.get("earnedRuns", 0))
        ip_str = stat.get("inningsPitched", "0.0")
        hits = int(stat.get("hits", 0))
        walks = int(stat.get("baseOnBalls", 0))

        ip = parse_innings(ip_str)
        bb_h = hits + walks

        return {"W": wins, "SV": saves, "K": strikeouts, "ER": er, "IP": ip, "BB_H": bb_h}
    except Exception as e:
        print(
            f"  [WARN] stats lookup failed for {entry.player_name} "
            f"({entry.mlb_id}) [pitching]: {e}"
        )
        return {"W": 0, "SV": 0, "K": 0, "ER": 0, "IP": 0.0, "BB_H": 0}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    periods = load_periods()
    roster = load_roster()

    if not periods:
        print("No periods loaded. Check ogba_periods_2025.json.")
        return
    if not roster:
        print("No roster entries with mlb_id. Check roster_ogba_2025.csv.")
        return

    all_rows: List[Dict[str, Any]] = []

    for period in periods:
        print(
            f"\n=== Period {period.id} – {period.label} "
            f"({period.start_date} to {period.end_date}) ==="
        )

        count = 0
        for entry in roster:
            # Hitting stats (everyone)
            h_stats = fetch_hitting_stats(entry, period.start_date, period.end_date)

            # Pitching stats (only for pitchers)
            if entry.is_pitcher:
                p_stats = fetch_pitching_stats(entry, period.start_date, period.end_date)
            else:
                p_stats = {"W": 0, "SV": 0, "K": 0, "ER": 0, "IP": 0.0, "BB_H": 0}

            # Rate stats (per player)
            ab = h_stats["AB"]
            hits = h_stats["H"]
            if ab > 0:
                avg = hits / ab
            else:
                avg = 0.0

            ip = p_stats["IP"]
            er = p_stats["ER"]
            bb_h = p_stats["BB_H"]

            if ip > 0:
                era = (er * 9.0) / ip
                whip = bb_h / ip
            else:
                era = 0.0
                whip = 0.0

            positions_str = "/".join(entry.positions) if entry.positions else ""
            team_name = TEAM_NAMES.get(entry.ogba_team_code, entry.ogba_team_code)

            row = {
                "period_id": period.id,
                "period_label": period.label,
                "start_date": period.start_date,
                "end_date": period.end_date,
                "team_code": entry.ogba_team_code,
                "team_name": team_name,
                "player_name": entry.player_name,
                "mlb_id": entry.mlb_id,
                "positions": positions_str,
                "is_pitcher": int(entry.is_pitcher),
                # Hitting counting stats
                "R": h_stats["R"],
                "HR": h_stats["HR"],
                "RBI": h_stats["RBI"],
                "SB": h_stats["SB"],
                "H": hits,
                "AB": ab,
                "AVG": round(avg, 3),
                # Pitching counting stats
                "W": p_stats["W"],
                "SV": p_stats["SV"],
                "K": p_stats["K"],
                "ER": er,
                "IP": round(ip, 2),
                "BB_H": bb_h,
                "ERA": round(era, 2),
                "WHIP": round(whip, 2),
            }

            all_rows.append(row)
            count += 1

        print(f"  Collected per-player totals for {count} roster entries.")

    out_path = "ogba_player_period_totals_2025.csv"
    if all_rows:
        fieldnames = list(all_rows[0].keys())
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(all_rows)
        print(f"\nWrote {len(all_rows)} rows to {out_path}")
    else:
        print("\nNo rows to write (all_rows is empty).")


if __name__ == "__main__":
    main()
