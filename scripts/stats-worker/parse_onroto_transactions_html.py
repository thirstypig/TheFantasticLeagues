#!/usr/bin/env python3
"""
Parse a saved OnRoto "Year to Date Transactions" HTML page into a canonical CSV/JSON.

Usage:
  python3 parse_onroto_transactions_html.py \
    --season 2025 \
    --infile data/onroto_transactions_2025.html \
    --outcsv ogba_transactions_2025.csv \
    --outjson ogba_transactions_2025.json

Notes:
- Eff. Date appears as "MM.DD" (no year). We attach --season.
- Submitted appears like "MM.DD @ HH:MM". We attach --season.
- Output includes stable row_hash to support idempotent upserts.
"""

import argparse
import csv
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


def norm(s: Any) -> str:
  return str(s or "").strip()


def parse_mmdd(season: int, mmdd: str) -> Optional[str]:
  mmdd = norm(mmdd)
  m = re.match(r"^(\d{1,2})\.(\d{1,2})$", mmdd)
  if not m:
    return None
  mm = int(m.group(1))
  dd = int(m.group(2))
  try:
    return datetime(season, mm, dd).strftime("%Y-%m-%d")
  except ValueError:
    return None


def parse_submitted(season: int, submitted: str) -> Optional[str]:
  s = norm(submitted)
  # Expected: "MM.DD @ HH:MM"
  m = re.match(r"^(\d{1,2})\.(\d{1,2})\s*@\s*(\d{1,2}):(\d{2})$", s)
  if not m:
    return None
  mm = int(m.group(1))
  dd = int(m.group(2))
  hh = int(m.group(3))
  mi = int(m.group(4))
  try:
    return datetime(season, mm, dd, hh, mi).isoformat(timespec="minutes")
  except ValueError:
    return None


def compute_hash(row: Dict[str, Any]) -> str:
  key = "|".join([
    norm(row.get("eff_date_raw")),
    norm(row.get("league")),
    norm(row.get("team")),
    norm(row.get("player")),
    norm(row.get("mlb_tm")),
    norm(row.get("transaction")),
    norm(row.get("submitted_raw")),
  ])
  return hashlib.md5(key.encode("utf-8")).hexdigest()


def read_tables_with_pandas(html_path: Path):
  import pandas as pd  # type: ignore
  return pd.read_html(str(html_path))


def pick_transactions_table(tables):
  """
  Pick the most likely transactions table from a list of pandas DataFrames.

  OnRoto's "Year to Date Transactions" tables frequently arrive with numeric
  columns (0..5) and the header row appears as the first *data* row. We score
  by looking for the "Year to Date Transactions" signature and expected labels
  in the first few rows.
  """
  def n(x: Any) -> str:
    return str(x).strip().lower()

  best_df = None
  best_score = -1
  best_i = None

  for i, df in enumerate(tables):
    if df is None or df.empty:
      continue

    score = 0

    # Shape heuristics
    if df.shape[1] == 6:
      score += 3
    elif df.shape[1] >= 4:
      score += 2
    if df.shape[0] >= 20:
      score += 2

    head_text = " ".join(
      n(x)
      for x in df.head(6).astype(str).values.flatten()
      if str(x).strip() != "" and str(x).lower() != "nan"
    )

    # Strong signature
    if "year to date transactions" in head_text:
      score += 6

    # Expected labels (often show up as data in the first rows)
    for token in ["eff. date", "eff date", "league team", "player", "tm", "transaction", "submitted"]:
      if token in head_text:
        score += 2

    # Transaction verbs
    for token in ["add to actives", "release", "activate", "disable", "change position", "trade", "waiver", "claim"]:
      if token in head_text:
        score += 1

    if score > best_score:
      best_score = score
      best_df = df
      best_i = i

  if best_df is None or best_score < 6:
    msg = [f"Could not confidently identify a transactions table. Found {len(tables)} tables. best_score={best_score} best_i={best_i}"]
    for i, df in enumerate(tables):
      msg.append(f"#{i} shape={df.shape} cols={[str(c) for c in df.columns]}")
    raise RuntimeError("\n".join(msg))

  return best_df


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument("--season", type=int, required=True, help="Season year to attach to MM.DD dates (e.g., 2025)")
  ap.add_argument("--infile", type=str, required=True, help="Path to saved HTML file")
  ap.add_argument("--outcsv", type=str, required=True, help="Output CSV path")
  ap.add_argument("--outjson", type=str, required=True, help="Output JSON path (array)")
  args = ap.parse_args()

  html_path = Path(args.infile)
  if not html_path.exists():
    raise SystemExit(f"Input file not found: {html_path}")

  try:
    tables = read_tables_with_pandas(html_path)
  except Exception as e:
    raise SystemExit(
      "Failed to parse HTML tables. If you see an ImportError, install deps:\n"
      "  python -m pip install pandas lxml\n"
      f"\nOriginal error: {e}"
    )

  df = pick_transactions_table(tables)
  raw_rows = df.to_dict(orient="records")

  out: List[Dict[str, Any]] = []

  for r in raw_rows:
    # OnRoto table frequently comes in as columns 0..5 (ints or strings).
    eff_date_raw = norm(r.get(0) or r.get("0"))
    team_raw     = norm(r.get(1) or r.get("1"))   # "League Team" (actually your fantasy team name)
    player       = norm(r.get(2) or r.get("2"))
    mlb_tm       = norm(r.get(3) or r.get("3"))
    txn          = norm(r.get(4) or r.get("4"))
    submitted_raw= norm(r.get(5) or r.get("5"))

    # Skip the embedded header rows pandas captured as data
    low = " ".join([eff_date_raw.lower(), team_raw.lower(), player.lower(), mlb_tm.lower(), txn.lower(), submitted_raw.lower()])
    if "year to date transactions" in low:
      continue
    if team_raw.lower() == "league team" and player.lower() == "player":
      continue
    if eff_date_raw.lower() in ["eff. date", "eff date"]:
      continue

    # Skip blank/noise rows
    if not (eff_date_raw or team_raw or player or mlb_tm or txn or submitted_raw):
      continue

    eff_date = parse_mmdd(args.season, eff_date_raw)
    submitted_at = parse_submitted(args.season, submitted_raw)

    row = {
      "season": args.season,
      "eff_date": eff_date,             # YYYY-MM-DD (best-effort)
      "eff_date_raw": eff_date_raw,     # original MM.DD
      "league": "",                     # not present in this HTML as a dedicated field
      "team": team_raw,                 # fantasy team name
      "player": player,
      "mlb_tm": mlb_tm,
      "transaction": txn,
      "submitted_at": submitted_at,     # ISO "YYYY-MM-DDTHH:MM" (best-effort)
      "submitted_raw": submitted_raw,   # original
    }
    row["row_hash"] = compute_hash(row)
    out.append(row)

  # Write CSV
  outcsv = Path(args.outcsv)
  with outcsv.open("w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(
      f,
      fieldnames=[
        "row_hash",
        "season",
        "eff_date",
        "eff_date_raw",
        "league",
        "team",
        "player",
        "mlb_tm",
        "transaction",
        "submitted_at",
        "submitted_raw",
      ],
    )
    w.writeheader()
    for row in out:
      w.writerow(row)

  # Write JSON
  outjson = Path(args.outjson)
  outjson.write_text(json.dumps(out, indent=2), encoding="utf-8")

  print(f"OK: parsed {len(out)} transactions")
  print(f"CSV:  {outcsv}")
  print(f"JSON: {outjson}")


if __name__ == "__main__":
  main()
