#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from typing import Any

# Supported providers
PROVIDER_POLYGON = "polygon"
PROVIDER_FINNHUB = "finnhub"

API_VERSIONS = ("v3", "v2", "v1")
API_PATTERNS = (
    # Query-style endpoint: /vX/reference/earnings?ticker=...
    "https://api.polygon.io/{version}/reference/earnings",
    # Path-style endpoint: /vX/reference/earnings/{ticker}
    "https://api.polygon.io/{version}/reference/earnings/{ticker}",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch Polygon earnings events and report coverage stats for a ticker set.",
    )
    parser.add_argument(
        "--tickers",
        type=str,
        default="AAPL,MSFT,NVDA,TSLA",
        help="Comma-separated list of symbols to request (default: AAPL,MSFT,NVDA,TSLA)",
    )
    parser.add_argument(
        "--start",
        type=str,
        default=(dt.date.today() - dt.timedelta(days=540)).isoformat(),
        help="Start date (inclusive) in YYYY-MM-DD format (default: 18 months ago)",
    )
    parser.add_argument(
        "--end",
        type=str,
        default=dt.date.today().isoformat(),
        help="End date (inclusive) in YYYY-MM-DD format (default: today)",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.25,
        help="Delay between paginated requests in seconds (default: 0.25)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print the first few raw events per symbol for inspection",
    )
    parser.add_argument(
        "--provider",
        type=str,
        default=PROVIDER_POLYGON,
        choices=[PROVIDER_POLYGON, PROVIDER_FINNHUB],
        help="Data provider to query (polygon | finnhub). Default: polygon",
    )
    return parser.parse_args()


def http_get(url: str) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "moonshot-polygon-earnings-test/1.0"},
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status != 200:
                    payload = resp.read().decode("utf-8", errors="ignore")
                    raise RuntimeError(
                        f"HTTP {resp.status} for {url} :: {payload[:200]}"
                    )
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            if attempt == 4:
                raise RuntimeError(f"Polygon request failed: {exc}") from exc
            wait_for = (attempt + 1) * 1.5
            time.sleep(wait_for)
    raise RuntimeError("Polygon request failed after retries")


def parse_date(value: Any) -> dt.date | None:
    if not value:
        return None
    if isinstance(value, dt.date):
        return value
    try:
        return dt.date.fromisoformat(str(value))
    except ValueError:
        return None


def fetch_polygon_earnings(
    ticker: str,
    start: dt.date,
    end: dt.date,
    api_key: str,
    delay: float,
) -> list[dict[str, Any]]:
    params: dict[str, str] = {
        "order": "asc",
        "sort": "reportDate",
        "limit": "100",
        "apiKey": api_key,
        "reportDate.gte": start.isoformat(),
        "reportDate.lte": end.isoformat(),
    }
    last_error: Exception | None = None
    for version in API_VERSIONS:
        version_had_events = False
        for pattern in API_PATTERNS:
            base_url = pattern.format(version=version, ticker=ticker)
            if "{ticker}" in pattern:
                query_params = params.copy()
                query_params.pop("apiKey", None)  # append separately
                query_string = urllib.parse.urlencode(query_params)
                url = f"{base_url}?{query_string}&apiKey={api_key}"
            else:
                query_params = params.copy()
                query_params["ticker"] = ticker
                url = f"{base_url}?{urllib.parse.urlencode(query_params)}"

            events: list[dict[str, Any]] = []
            next_url: str | None = url
            try:
                while next_url:
                    payload = http_get(next_url)
                    batch = payload.get("results") or []
                    events.extend(batch)
                    next_url = payload.get("next_url")
                    if next_url and "apiKey=" not in next_url:
                        connector = "&" if "?" in next_url else "?"
                        next_url = f"{next_url}{connector}apiKey={api_key}"
                    if next_url:
                        time.sleep(delay)
                if events:
                    version_had_events = True
                    return events
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                continue
        if version_had_events:
            break
    if last_error:
        raise last_error
    return []


def fetch_finnhub_earnings(
    ticker: str,
    start: dt.date,
    end: dt.date,
    api_key: str,
    delay: float,
) -> list[dict[str, Any]]:
    window = dt.timedelta(days=90)
    cursor = start
    collected: list[dict[str, Any]] = []
    while cursor <= end:
        chunk_end = min(cursor + window, end)
        params = {
            "from": cursor.isoformat(),
            "to": chunk_end.isoformat(),
            "symbol": ticker,
            "token": api_key,
        }
        url = (
            "https://finnhub.io/api/v1/calendar/earnings?"
            f"{urllib.parse.urlencode(params)}"
        )
        payload = http_get(url)
        events = payload.get("earningsCalendar") or []
        for evt in events:
            collected.append(
                {
                    "reportDate": evt.get("date"),
                    "ticker": evt.get("symbol"),
                    "fiscalPeriod": evt.get("quarter") or evt.get("period"),
                    "fiscalYear": evt.get("year"),
                    "epsActual": evt.get("epsActual"),
                    "epsEstimate": evt.get("epsEstimate"),
                    "epsSurprisePct": evt.get("epsSurprisePercent"),
                    "payload": evt,
                }
            )
        cursor = chunk_end + dt.timedelta(days=1)
        time.sleep(delay)
    seen: set[tuple[str | None, str | None]] = set()
    deduped: list[dict[str, Any]] = []
    for evt in sorted(collected, key=lambda e: (e["reportDate"] or "", e["ticker"] or "")):
        key = (evt.get("reportDate"), evt.get("ticker"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(evt)
    return deduped


def quarter_key(event: dict[str, Any]) -> str:
    fiscal_period = (
        event.get("fiscalPeriod")
        or event.get("quarter")
        or event.get("period")
        or "?"
    )
    fiscal_year = event.get("fiscalYear") or event.get("year")
    if fiscal_year is None:
        return fiscal_period
    return f"{fiscal_period} {fiscal_year}"


def summarize_events(
    ticker: str,
    events: list[dict[str, Any]],
    start: dt.date,
    end: dt.date,
) -> dict[str, Any]:
    dates = [parse_date(evt.get("reportDate")) for evt in events]
    valid_dates = sorted([d for d in dates if d is not None])
    count = len(valid_dates)
    if count == 0:
        return {
            "ticker": ticker,
            "events": 0,
            "first": None,
            "last": None,
            "max_gap_days": None,
            "unique_quarters": 0,
            "coverage_ratio": 0.0,
        }
    max_gap = 0
    for idx in range(1, len(valid_dates)):
        gap = (valid_dates[idx] - valid_dates[idx - 1]).days
        if gap > max_gap:
            max_gap = gap
    month_span = (end.year - start.year) * 12 + (end.month - start.month) + 1
    expected_quarters = max(1, round(month_span / 3))
    unique_quarters = len({quarter_key(evt) for evt in events})
    coverage_ratio = min(1.0, unique_quarters / expected_quarters)
    return {
        "ticker": ticker,
        "events": count,
        "first": valid_dates[0],
        "last": valid_dates[-1],
        "max_gap_days": max_gap,
        "unique_quarters": unique_quarters,
        "coverage_ratio": coverage_ratio,
    }


def print_summary(rows: list[dict[str, Any]]) -> None:
    print(
        "ticker events first_report last_report max_gap_days unique_quarters coverage_ratio",
    )
    for row in rows:
        first = row["first"].isoformat() if row["first"] else "-"
        last = row["last"].isoformat() if row["last"] else "-"
        gap = row["max_gap_days"] if row["max_gap_days"] is not None else "-"
        coverage = f"{row['coverage_ratio']*100:5.1f}%"
        print(
            f"{row['ticker']:6} {row['events']:6d} {first:12} {last:12} {gap!s:12} "
            f"{row['unique_quarters']:14d} {coverage}",
        )


def dump_sample_events(
    ticker: str,
    events: list[dict[str, Any]],
    count: int = 3,
) -> None:
    if not events:
        print(f"  {ticker}: no events returned")
        return
    print(f"  {ticker}: showing up to {count} events")
    for evt in events[:count]:
        report_date = evt.get("reportDate")
        fiscal_period = evt.get("fiscalPeriod")
        fiscal_year = evt.get("fiscalYear")
        eps_actual = evt.get("epsActual") or evt.get("actual")
        eps_estimate = evt.get("epsEstimate") or evt.get("estimate")
        surprise = evt.get("epsSurprisePct") or evt.get("surprisePercent")
        print(
            f"    {report_date} fiscal={fiscal_period} {fiscal_year} "
            f"eps={eps_actual} est={eps_estimate} surprise={surprise}",
        )


def main() -> int:
    args = parse_args()
    try:
        start_date = dt.date.fromisoformat(args.start)
        end_date = dt.date.fromisoformat(args.end)
    except ValueError as exc:
        print(f"Error parsing dates: {exc}", file=sys.stderr)
        return 1
    if start_date > end_date:
        print("--start must be on or before --end", file=sys.stderr)
        return 1
    provider = args.provider
    if provider == PROVIDER_POLYGON:
        api_key = os.getenv("POLYGON_API_KEY")
        if not api_key:
            print("Missing POLYGON_API_KEY environment variable", file=sys.stderr)
            return 1
    else:
        api_key = os.getenv("FINNHUB_API_KEY") or os.getenv("FINNHUB_TOKEN")
        if not api_key:
            print(
                "Missing FINNHUB_API_KEY (or FINNHUB_TOKEN) environment variable",
                file=sys.stderr,
            )
            return 1
    tickers = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
    if not tickers:
        print("No tickers provided", file=sys.stderr)
        return 1
    summaries: list[dict[str, Any]] = []
    for ticker in tickers:
        try:
            if provider == PROVIDER_POLYGON:
                events = fetch_polygon_earnings(
                    ticker, start_date, end_date, api_key, args.sleep
                )
            else:
                events = fetch_finnhub_earnings(
                    ticker, start_date, end_date, api_key, args.sleep
                )
        except Exception as exc:  # noqa: BLE001
            print(f"Error fetching {ticker}: {exc}", file=sys.stderr)
            continue
        summaries.append(summarize_events(ticker, events, start_date, end_date))
        if args.verbose:
            dump_sample_events(ticker, events)
    if not summaries:
        print("No summaries generated", file=sys.stderr)
        return 1
    print_summary(summaries)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
