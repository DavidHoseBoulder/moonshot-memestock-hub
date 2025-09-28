#!/usr/bin/env python3
"""Summarise StockTwits vs Reddit calibration sample exported via stocktwits_reddit_calibration.sql."""
from __future__ import annotations

import csv
import math
import sys
from collections import defaultdict
from pathlib import Path

DEFAULT_PATH = Path("analysis/stocktwits_reddit_calibration.csv")


def parse_int(value: str | None) -> int:
    return int(value) if value not in (None, "") else 0


def parse_float(value: str | None) -> float:
    if value in (None, ""):
        return 0.0
    return float(value)


def corr(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) != len(ys) or len(xs) < 2:
        return None
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    var_x = sum((x - mean_x) ** 2 for x in xs)
    var_y = sum((y - mean_y) ** 2 for y in ys)
    if var_x <= 0 or var_y <= 0:
        return None
    return cov / math.sqrt(var_x * var_y)


def main(path: Path) -> None:
    if not path.exists():
        sys.stderr.write(f"Input CSV not found: {path}\n")
        sys.exit(1)

    per_day = {}
    message_rows = 0

    with path.open(newline="") as infile:
        reader = csv.DictReader(infile)
        for row in reader:
            message_rows += 1
            day = row["day"]
            symbol = row["symbol"].upper()
            key = (day, symbol)
            rec = per_day.setdefault(
                key,
                {
                    "st_messages": 0,
                    "st_bullish": 0,
                    "st_bearish": 0,
                    "st_sentiment_sum": 0.0,
                    "st_weighted_sum": 0.0,
                    "st_followers": 0,
                    "reddit_mentions": None,
                    "reddit_pos": None,
                    "reddit_neg": None,
                    "reddit_avg": None,
                },
            )

            label = row.get("st_label", "")
            followers = parse_int(row.get("st_followers"))
            sentiment_val = 1.0 if label == "Bullish" else -1.0 if label == "Bearish" else 0.0

            rec["st_messages"] += 1
            rec["st_sentiment_sum"] += sentiment_val
            rec["st_followers"] += followers
            rec["st_weighted_sum"] += sentiment_val * followers
            if label == "Bullish":
                rec["st_bullish"] += 1
            elif label == "Bearish":
                rec["st_bearish"] += 1

            if rec["reddit_mentions"] is None:
                rec["reddit_mentions"] = parse_int(row.get("reddit_mentions"))
                rec["reddit_pos"] = parse_int(row.get("reddit_positive"))
                rec["reddit_neg"] = parse_int(row.get("reddit_negative"))
                rec["reddit_avg"] = parse_float(row.get("reddit_avg_score"))

    total_ticker_days = len(per_day)
    overlap_counts = defaultdict(int)
    st_weighted_vals: list[float] = []
    st_simple_vals: list[float] = []
    reddit_vals: list[float] = []

    for rec in per_day.values():
        st_net = rec["st_bullish"] - rec["st_bearish"]
        reddit_pos = rec["reddit_pos"] or 0
        reddit_neg = rec["reddit_neg"] or 0
        reddit_net = reddit_pos - reddit_neg

        if st_net > 0 and reddit_net > 0:
            bucket = "Both Bullish"
        elif st_net < 0 and reddit_net < 0:
            bucket = "Both Bearish"
        elif st_net == 0 and reddit_net == 0:
            bucket = "Both Neutral"
        elif st_net > 0 and reddit_net <= 0:
            bucket = "ST Bullish / Reddit Non-Pos"
        elif st_net < 0 and reddit_net >= 0:
            bucket = "ST Bearish / Reddit Non-Neg"
        else:
            bucket = "Mixed"
        overlap_counts[bucket] += 1

        if rec["st_messages"] > 0:
            st_simple_avg = rec["st_sentiment_sum"] / rec["st_messages"]
        else:
            st_simple_avg = 0.0

        if rec["st_followers"] > 0:
            st_weighted_avg = rec["st_weighted_sum"] / rec["st_followers"]
        elif rec["st_messages"] > 0:
            st_weighted_avg = st_simple_avg
        else:
            st_weighted_avg = 0.0

        if rec["reddit_avg"] is not None:
            st_weighted_vals.append(st_weighted_avg)
            st_simple_vals.append(st_simple_avg)
            reddit_vals.append(rec["reddit_avg"])

    weighted_corr = corr(st_weighted_vals, reddit_vals)
    simple_corr = corr(st_simple_vals, reddit_vals)

    print(f"Total StockTwits messages: {message_rows}")
    print(f"Total ticker-days:        {total_ticker_days}")
    print()
    print("Polarity overlap:")
    for bucket, count in sorted(overlap_counts.items(), key=lambda kv: -kv[1]):
        pct = (100.0 * count / total_ticker_days) if total_ticker_days else 0.0
        print(f"  {bucket:<28} {count:5d} ({pct:5.1f}%)")

    print()
    if weighted_corr is not None:
        print(f"Corr(st_weighted, reddit_avg): {weighted_corr:0.3f}")
    else:
        print("Corr(st_weighted, reddit_avg): n/a")

    if simple_corr is not None:
        print(f"Corr(st_simple, reddit_avg):   {simple_corr:0.3f}")
    else:
        print("Corr(st_simple, reddit_avg):   n/a")

    print()
    print("Follower-weighted averages (sample):")
    if st_weighted_vals:
        print(f"  Mean ST weighted: {sum(st_weighted_vals)/len(st_weighted_vals):0.3f}")
        print(f"  Mean Reddit avg:  {sum(reddit_vals)/len(reddit_vals):0.3f}")
    else:
        print("  No overlap values to summarise")


if __name__ == "__main__":
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    main(csv_path)
