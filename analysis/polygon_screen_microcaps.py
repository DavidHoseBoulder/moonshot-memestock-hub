#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request
from math import sqrt

API_URL = "https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted=true"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Screen micro/meme-cap stocks using Polygon grouped daily data.")
    parser.add_argument("--days", type=int, default=20, help="Number of recent trading days to average (default: 20)")
    parser.add_argument("--adv-min", type=float, default=5e6, help="Minimum average dollar volume (default: 5e6)")
    parser.add_argument("--adv-max", type=float, default=1.5e8, help="Maximum average dollar volume (default: 1.5e8)")
    parser.add_argument("--price-min", type=float, default=1.0, help="Minimum last close (default: 1)")
    parser.add_argument("--price-max", type=float, default=20.0, help="Maximum last close (default: 20)")
    parser.add_argument("--limit", type=int, default=25, help="Number of rows to display (default: 25)")
    parser.add_argument("--min-days", type=int, default=10, help="Minimum observations per symbol (default: 10)")
    parser.add_argument("--sleep", type=float, default=0.25, help="Delay between API calls (default: 0.25s)")
    parser.add_argument("--output", type=str, help="Optional CSV path to write results")
    parser.add_argument("--verbose", action="store_true", help="Print progress details")
    return parser.parse_args()


def http_get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "moonshot-microcap-screen/1.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"HTTP {resp.status} for {url}")
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            if attempt == 2:
                raise RuntimeError(f"Polygon request failed: {exc}") from exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("Polygon request failed after retries")


def trading_dates(days: int) -> list[str]:
    today = dt.date.today()
    collected: list[str] = []
    cursor = today
    while len(collected) < days:
        date_str = cursor.strftime("%Y-%m-%d")
        collected.append(date_str)
        cursor -= dt.timedelta(days=1)
    return collected


def stdev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    var = sum((v - mean) ** 2 for v in values) / (len(values) - 1)
    return sqrt(var)


def screen(args: argparse.Namespace, api_key: str) -> list[dict[str, object]]:
    records: dict[str, dict[str, object]] = {}
    gotten_days = 0
    for date_str in trading_dates(args.days * 2):
        if gotten_days >= args.days:
            break
        url = f"{API_URL.format(date=date_str)}&apiKey={api_key}"
        payload = http_get(url)
        results = payload.get("results") or []
        if not results:
            continue
        gotten_days += 1
        if args.verbose:
            print(f"Fetched {len(results)} rows for {date_str}", file=sys.stderr)
        for row in results:
            ticker = row.get("T")
            close = row.get("c")
            open_ = row.get("o")
            volume = row.get("v")
            vw = row.get("vw")
            if not ticker or close is None or volume is None or vw is None:
                continue
            entry = records.setdefault(
                ticker,
                {
                    "dollar": [],
                    "moves": [],
                    "last_close": close,
                    "last_date": date_str,
                },
            )
            entry["last_close"] = close
            entry["last_date"] = date_str
            entry["dollar"].append(volume * vw)
            if open_ and open_ > 0:
                entry["moves"].append(abs((close - open_) / open_))
        time.sleep(args.sleep)
    rows: list[dict[str, object]] = []
    for ticker, entry in records.items():
        obs = len(entry["dollar"])
        if obs < args.min_days:
            continue
        avg_dollar = sum(entry["dollar"]) / obs
        if avg_dollar < args.adv_min or avg_dollar > args.adv_max:
            continue
        price = entry["last_close"]
        if price < args.price_min or price > args.price_max:
            continue
        vol = stdev(entry["moves"])
        if not entry["moves"]:
            continue
        annual_vol = vol * sqrt(252)
        rows.append(
            {
                "symbol": ticker,
                "avg_dollar_volume": avg_dollar,
                "last_close": price,
                "daily_move": sum(entry["moves"]) / len(entry["moves"]),
                "stdev_move": vol,
                "annualized_vol": annual_vol,
                "observations": obs,
                "last_date": entry["last_date"],
            }
        )
    rows.sort(key=lambda r: (r["annualized_vol"], r["avg_dollar_volume"]), reverse=True)
    return rows[: args.limit]


def write_output(rows: list[dict[str, object]], output: str | None) -> None:
    if not rows:
        print("No symbols met the filters.")
        return
    header = [
        "symbol",
        "last_close",
        "avg_dollar_volume",
        "daily_move",
        "stdev_move",
        "annualized_vol",
        "observations",
        "last_date",
    ]
    print("symbol last_close avg_dollar_volume daily_move stdev_move annualized_vol obs last_date")
    for row in rows:
        print(
            f"{row['symbol']:6} {row['last_close']:9.2f} {row['avg_dollar_volume']/1e6:17.2f}M"
            f" {row['daily_move']*100:9.2f}% {row['stdev_move']*100:9.2f}% {row['annualized_vol']*100:9.2f}%"
            f" {row['observations']:3d} {row['last_date']}"
        )
    if output:
        output_path = os.path.abspath(output)
        with open(output_path, "w", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=header)
            writer.writeheader()
            writer.writerows(rows)
        print(f"\nWrote {len(rows)} rows to {output_path}")


def main() -> int:
    args = parse_args()
    api_key = os.environ.get("POLYGON_API_KEY")
    if not api_key:
        print("POLYGON_API_KEY env var is required", file=sys.stderr)
        return 1
    try:
        rows = screen(args, api_key)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    write_output(rows, args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
