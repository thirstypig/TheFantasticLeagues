import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Any, Tuple

INPUT_CSV = Path("ogba_player_period_totals_2025.csv")
OUTPUT_PERIOD = Path("ogba_period_standings_2025.json")
OUTPUT_SEASON = Path("ogba_season_standings_2025.json")

# Canonical OGBA team metadata
# Keys are ogba_team_code values from the CSV.
TEAM_META: Dict[str, Dict[str, Any]] = {
    "DLC": {
        "teamId": 1,
        "teamName": "Demolition Lumber Co.",
        "owner": "Yuji Ogasa",
    },
    "DMK": {
        "teamId": 2,
        "teamName": "Diamond Kings",
        "owner": "Kent Sakamoto",
    },
    "DDG": {
        "teamId": 3,
        "teamName": "Devil Dawgs",
        "owner": "Gregg Iwamiya",
    },
    "SKD": {
        "teamId": 4,
        "teamName": "Skunk Dogs",
        "owner": "Tim Yuba",
    },
    "LDY": {
        "teamId": 5,
        "teamName": "Los Doyers",
        "owner": "James Chang",
    },
    "DVD": {
        "teamId": 6,
        "teamName": "Dodger Dawgs",
        "owner": "Kurt Sakamoto",
    },
    "RGS": {
        "teamId": 7,
        "teamName": "RGing Sluggers",
        "owner": "Danny Wong",
    },
    "TSH": {
        "teamId": 8,
        "teamName": "The Show",
        "owner": "Jerrod Jue",
    },
}


def detect_columns(fieldnames):
    lower_map = {name.lower(): name for name in fieldnames}

    def find(candidates, required=True):
        for cand in candidates:
            key = lower_map.get(cand.lower())
            if key:
                return key
        if required:
            raise SystemExit(
                f"Missing required column. Tried {candidates}, have {fieldnames}"
            )
        return None

    cols = {
        "period": find(
            ["period_id", "period", "period_number", "period_index", "periodIndex"]
        ),
        "team": find(["ogba_team_code", "team_code", "team", "team_short"]),
        "team_name": find(
            ["team_name", "ogba_team_name", "fantasy_team_name"], required=False
        ),
        "owner": find(["owner", "owner_name", "manager"], required=False),
        "is_pitcher": find(["is_pitcher", "pitcher_flag"], required=False),
        "R": find(["R", "runs"]),
        "HR": find(["HR", "home_runs"]),
        "RBI": find(["RBI", "runs_batted_in"]),
        "SB": find(["SB", "steals", "stolen_bases"]),
        "H": find(["H", "hits"]),
        "AB": find(["AB", "at_bats"]),
        "W": find(["W", "wins"]),
        "S": find(["SV", "S", "saves"]),
        "K": find(["K", "SO", "strikeouts"]),
        "ER": find(["ER", "earned_runs"]),
        "IP": find(["IP", "innings"]),
        "BB_H": find(["BB_H", "bb_h", "bb_plus_h", "bbh"]),
    }
    return cols


def safe_float(row, col):
    if not col:
        return 0.0
    val = row.get(col, "")
    if val is None:
        return 0.0
    val = str(val).strip()
    if val == "":
        return 0.0
    try:
        return float(val)
    except ValueError:
        return 0.0


def parse_ip(raw):
    if raw is None:
        return 0.0
    s = str(raw).strip()
    if s == "":
        return 0.0
    # Try simple float first
    try:
        return float(s)
    except ValueError:
        pass
    # Handle MLB-style "34.1" = 34 + 1/3, "34.2" = 34 + 2/3
    if "." in s:
        whole, frac = s.split(".", 1)
        try:
            whole_i = int(whole or "0")
        except ValueError:
            whole_i = 0
        frac = frac.strip()
        if frac == "0":
            return float(whole_i)
        if frac == "1":
            return whole_i + 1.0 / 3.0
        if frac == "2":
            return whole_i + 2.0 / 3.0
    return 0.0


def assign_roto_points(rows: List[Dict[str, Any]], stat_key: str, higher_is_better: bool):
    n = len(rows)
    if n == 0:
        return

    data: List[Tuple[int, float]] = []
    for idx, row in enumerate(rows):
        v = row.get(stat_key, 0.0)
        try:
            v = float(v)
        except (ValueError, TypeError):
            v = 0.0
        data.append((idx, v))

    # Sort: best row first depending on direction
    data.sort(key=lambda x: x[1], reverse=higher_is_better)

    points = [0.0] * n
    rank = 1
    i = 0
    while i < n:
        j = i
        v = data[i][1]
        # Find tie group
        while j + 1 < n and data[j + 1][1] == v:
            j += 1
        # Positions are rank..(rank+count-1)
        count = j - i + 1
        total_pts = 0.0
        for offset in range(count):
            place = rank + offset
            total_pts += n - place + 1  # roto: best gets n, worst gets 1
        avg_pts = total_pts / count
        for k in range(i, j + 1):
            original_idx = data[k][0]
            points[original_idx] += avg_pts
        rank += count
        i = j + 1

    # Write back
    for idx, row in enumerate(rows):
        cat_pts = row.setdefault("categoryPoints", {})
        cat_pts[stat_key] = points[idx]
        row["totalPoints"] = row.get("totalPoints", 0.0) + points[idx]


def main():
    if not INPUT_CSV.exists():
        raise SystemExit(f"Input CSV not found: {INPUT_CSV}")

    with INPUT_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Loaded {len(rows)} rows from {INPUT_CSV}")

    if not rows:
        OUTPUT_PERIOD.write_text("[]", encoding="utf-8")
        OUTPUT_SEASON.write_text("[]", encoding="utf-8")
        print("No rows in CSV; wrote empty standings JSON files.")
        return

    cols = detect_columns(reader.fieldnames or [])
    print("Detected columns:", cols)

    # Determine numeric period IDs (1..N) based on whatever the period column holds
    raw_period_values = [
        str(r.get(cols["period"], "")).strip()
        for r in rows
        if str(r.get(cols["period"], "")).strip() != ""
    ]
    unique_period_values = sorted(set(raw_period_values))

    period_value_to_id: Dict[str, int] = {}
    all_numeric = all(v.isdigit() for v in unique_period_values)
    if all_numeric:
        for v in unique_period_values:
            period_value_to_id[v] = int(v)
    else:
        for idx, v in enumerate(unique_period_values, start=1):
            period_value_to_id[v] = idx

    print("Period mapping (CSV value -> periodId):", period_value_to_id)

    # Aggregate stats per period + team
    per_period_team: Dict[int, Dict[str, Dict[str, Any]]] = defaultdict(dict)
    season_team: Dict[str, Dict[str, Any]] = {}

    for r in rows:
        raw_period = str(r.get(cols["period"], "")).strip()
        if not raw_period:
            continue
        period_id = period_value_to_id.get(raw_period)
        if period_id is None:
            continue

        team_code = str(r.get(cols["team"], "")).strip()
        if not team_code:
            continue

        csv_team_name = str(r.get(cols["team_name"], "") or team_code).strip()
        csv_owner = str(r.get(cols["owner"], "") or "").strip() or None

        meta = TEAM_META.get(team_code, {})
        team_id = meta.get("teamId", 0)
        team_name = meta.get("teamName", csv_team_name)
        owner = meta.get("owner", csv_owner)

        def get_bucket(target: Dict[str, Dict[str, Any]]):
            if team_code not in target:
                target[team_code] = {
                    "teamId": team_id,
                    "teamCode": team_code,
                    "teamName": team_name,
                    "owner": owner,
                    "R": 0.0,
                    "HR": 0.0,
                    "RBI": 0.0,
                    "SB": 0.0,
                    "H": 0.0,
                    "AB": 0.0,
                    "W": 0.0,
                    "S": 0.0,
                    "K": 0.0,
                    "ER": 0.0,
                    "IP": 0.0,
                    "BB_H": 0.0,
                }
            return target[team_code]

        # Period bucket
        period_bucket = per_period_team[period_id]
        p_stats = get_bucket(period_bucket)

        # Season bucket
        s_stats = get_bucket(season_team)

        for bucket in (p_stats, s_stats):
            bucket["R"] += safe_float(r, cols["R"])
            bucket["HR"] += safe_float(r, cols["HR"])
            bucket["RBI"] += safe_float(r, cols["RBI"])
            bucket["SB"] += safe_float(r, cols["SB"])
            bucket["H"] += safe_float(r, cols["H"])
            bucket["AB"] += safe_float(r, cols["AB"])
            bucket["W"] += safe_float(r, cols["W"])
            bucket["S"] += safe_float(r, cols["S"])
            bucket["K"] += safe_float(r, cols["K"])
            bucket["ER"] += safe_float(r, cols["ER"])
            bucket["IP"] += parse_ip(r.get(cols["IP"]))
            bucket["BB_H"] += safe_float(r, cols["BB_H"])

    print(f"Found {len(per_period_team)} periods with stats.")
    print(f"Found {len(season_team)} teams with season stats.")

    def finalize_rows(team_stats: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows_out: List[Dict[str, Any]] = []
        for code, s in team_stats.items():
            H = s["H"]
            AB = s["AB"]
            IP = s["IP"]
            ER = s["ER"]
            BB_H = s["BB_H"]

            avg = H / AB if AB > 0 else 0.0
            era = 9.0 * ER / IP if IP > 0 else 0.0
            whip = BB_H / IP if IP > 0 else 0.0

            meta = TEAM_META.get(code, {})
            team_id = s.get("teamId") or meta.get("teamId", 0)
            team_name = s.get("teamName") or meta.get("teamName", code)
            owner = s.get("owner") or meta.get("owner")

            rows_out.append(
                {
                    "teamId": team_id,
                    "teamName": team_name,
                    "owner": owner,
                    "R": s["R"],
                    "HR": s["HR"],
                    "RBI": s["RBI"],
                    "SB": s["SB"],
                    "AVG": avg,
                    "W": s["W"],
                    "S": s["S"],
                    "K": s["K"],
                    "ERA": era,
                    "WHIP": whip,
                    "totalPoints": 0.0,
                }
            )
        return rows_out

    # Which categories to score roto-style
    roto_categories = [
        ("R", True),
        ("HR", True),
        ("RBI", True),
        ("SB", True),
        ("AVG", True),
        ("W", True),
        ("S", True),
        ("K", True),
        ("ERA", False),  # lower is better
        ("WHIP", False),  # lower is better
    ]

    # --- Period standings ---
    period_output: List[Dict[str, Any]] = []
    for period_id in sorted(per_period_team.keys()):
        team_stats = per_period_team[period_id]
        rows_out = finalize_rows(team_stats)

        for stat_key, higher in roto_categories:
            assign_roto_points(rows_out, stat_key, higher)

        period_output.append(
            {
                "periodId": period_id,
                "label": f"Period {period_id}",
                "rows": rows_out,
            }
        )

    OUTPUT_PERIOD.write_text(json.dumps(period_output, indent=2), encoding="utf-8")
    print(f"Wrote period standings for {len(period_output)} periods -> {OUTPUT_PERIOD}")

    # --- Season standings ---
    season_rows = finalize_rows(season_team)

    for stat_key, higher in roto_categories:
        assign_roto_points(season_rows, stat_key, higher)

    OUTPUT_SEASON.write_text(json.dumps(season_rows, indent=2), encoding="utf-8")
    print(f"Wrote season standings for {len(season_rows)} teams -> {OUTPUT_SEASON}")


if __name__ == "__main__":
    main()
