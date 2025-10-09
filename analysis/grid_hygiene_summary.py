#!/usr/bin/env python3
"""Grid hygiene summariser.

This helper turns the exported grid CSV into human-friendly Markdown tables and
optional PNG charts. The intention is to keep an evergreen summary that can be
linked from docs (e.g. `BacktestingPipeline.md`) or surfaced later inside the
Lovable UX.

Typical usage after a sweep:

    python analysis/grid_hygiene_summary.py \
        --input /private/tmp/grid_full.csv \
        --output results/grid_full_summary.md \
        --plots results

The script expects pandas, and the `--plots` option additionally requires
matplotlib + seaborn (install with `python3 -m pip install --user pandas
matplotlib seaborn`).
"""
from __future__ import annotations

import argparse
import pathlib
import sys
from typing import Dict, Iterable, Tuple

try:
    import pandas as pd
except ImportError as exc:  # pragma: no cover - runtime guard
    raise SystemExit(
        "pandas is required. install with `python3 -m pip install --user pandas`."
    ) from exc

# Hard-coded set of promoted pockets from the most recent promotion run.
PROMOTED_KEYS: set[Tuple[str, str, str, int, float]] = {
    ("SOFI", "5d", "LONG", 4, 0.15),
    ("SOUN", "3d", "LONG", 4, 0.15),
    ("SPY", "5d", "LONG", 2, 0.05),
    ("SPY", "3d", "LONG", 2, 0.10),
    ("TSLA", "5d", "LONG", 4, 0.10),
    ("SOUN", "5d", "LONG", 6, 0.10),
    ("GOOGL", "5d", "LONG", 6, 0.15),
    ("SOUN", "1d", "LONG", 6, 0.15),
    ("FUBO", "5d", "LONG", 6, 0.05),
    ("MARA", "3d", "LONG", 4, 0.05),
    ("GOOGL", "3d", "LONG", 6, 0.15),
    ("MSFT", "5d", "LONG", 4, 0.05),
    ("SOFI", "3d", "LONG", 6, 0.15),
    ("AAPL", "3d", "LONG", 6, 0.05),
    ("PYPL", "1d", "LONG", 2, 0.15),
    ("FUBO", "3d", "LONG", 6, 0.05),
    ("HOOD", "5d", "LONG", 2, 0.10),
    ("BBAI", "3d", "LONG", 6, 0.15),
    ("INTC", "5d", "LONG", 6, 0.05),
    ("BBAI", "5d", "LONG", 2, 0.10),
    ("AAPL", "5d", "LONG", 2, 0.05),
    ("AMD", "1d", "LONG", 2, 0.15),
    ("ASTS", "3d", "LONG", 6, 0.15),
    ("AMD", "5d", "LONG", 4, 0.15),
    ("SNAP", "3d", "LONG", 4, 0.05),
    ("HOOD", "3d", "LONG", 2, 0.10),
    ("BBAI", "1d", "LONG", 6, 0.15),
    ("ASTS", "1d", "LONG", 6, 0.10),
    ("AMD", "3d", "LONG", 6, 0.15),
}


def _format_table(df: pd.DataFrame) -> str:
    """Return a Markdown formatted table."""
    return df.to_markdown(tablefmt="pipe", index=True)  # type: ignore[no-any-return]


def analyse_grid(df: pd.DataFrame) -> Tuple[Dict[str, str], Dict[str, pd.DataFrame]]:
    """Compute summary strings and the underlying DataFrames."""
    summaries: dict[str, str] = {}
    tables: dict[str, pd.DataFrame] = {}

    horizon = (
        df.groupby("horizon")
        .agg(
            n=("sharpe", "count"),
            sharpe_avg=("sharpe", "mean"),
            trades_avg=("trades", "mean"),
            adv30_avg=("avg_daily_dollar_volume_30d", "mean"),
            health_avg=("avg_sentiment_health_score", "mean"),
        )
        .assign(
            sharpe_avg=lambda d: d["sharpe_avg"].round(3),
            trades_avg=lambda d: d["trades_avg"].round(1),
            adv30_avg_bil=lambda d: (d["adv30_avg"] / 1e9).round(2),
            health_avg=lambda d: d["health_avg"].round(2),
        )
        [["n", "sharpe_avg", "trades_avg", "adv30_avg_bil", "health_avg"]]
    )
    summaries["Horizon Summary"] = _format_table(horizon)
    tables["Horizon Summary"] = horizon

    band = (
        df.groupby("band")["sharpe"]
        .agg(["count", "mean", "max"])
        .round({"mean": 3, "max": 3})
    )
    summaries["Band vs Sharpe"] = _format_table(band)
    tables["Band vs Sharpe"] = band

    df = df.copy()
    df["is_promoted"] = df.apply(
        lambda r: (
            r.symbol,
            r.horizon,
            r.side,
            int(r.min_mentions),
            float(r.pos_thresh),
        )
        in PROMOTED_KEYS,
        axis=1,
    )

    promoted = (
        df.groupby("is_promoted")
        .agg(
            n=("symbol", "count"),
            sharpe_avg=("sharpe", "mean"),
            trades_avg=("trades", "mean"),
            adv30_avg=("avg_daily_dollar_volume_30d", "mean"),
            health_avg=("avg_sentiment_health_score", "mean"),
        )
        .assign(
            sharpe_avg=lambda d: d["sharpe_avg"].round(3),
            trades_avg=lambda d: d["trades_avg"].round(1),
            adv30_avg_bil=lambda d: (d["adv30_avg"] / 1e9).round(2),
            health_avg=lambda d: d["health_avg"].round(2),
        )
        [["n", "sharpe_avg", "trades_avg", "adv30_avg_bil", "health_avg"]]
    )
    summaries["Promoted vs Others"] = _format_table(promoted)
    tables["Promoted vs Others"] = promoted

    top = (
        df.sort_values("sharpe", ascending=False)
        .head(20)
        [[
            "symbol",
            "horizon",
            "side",
            "min_mentions",
            "pos_thresh",
            "band",
            "sharpe",
            "trades",
            "avg_daily_dollar_volume_30d",
            "avg_sentiment_health_score",
            "avg_beta_vs_spy",
        ]]
    )
    summaries["Top Pockets by Sharpe"] = _format_table(top)
    tables["Top Pockets by Sharpe"] = top

    tables["Raw"] = df

    return summaries, tables


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=pathlib.Path,
        required=True,
        help="Path to grid CSV exported from backtest_grid.sql",
    )
    parser.add_argument(
        "--output",
        type=pathlib.Path,
        help="Optional output Markdown file to write summaries to",
    )
    parser.add_argument(
        "--plots",
        type=pathlib.Path,
        help="Optional directory to write PNG charts to",
    )
    args = parser.parse_args(argv)

    if not args.input.exists():
        parser.error(f"CSV not found: {args.input}")

    df = pd.read_csv(args.input)
    summaries, tables = analyse_grid(df)

    report_lines = []
    for title, table in summaries.items():
        report_lines.append(f"## {title}\n")
        report_lines.append(table)
        report_lines.append("")

    report = "\n".join(report_lines)
    print(report)

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report)
        print(f"\nWrote summary to {args.output}")

    if args.plots:
        try:
            import matplotlib.pyplot as plt
            import seaborn as sns
        except ImportError as exc:  # pragma: no cover - runtime guard
            raise SystemExit(
                "matplotlib and seaborn are required for plotting. install with "
                "`python3 -m pip install --user matplotlib seaborn`."
            ) from exc

        plot_dir = args.plots
        plot_dir.mkdir(parents=True, exist_ok=True)

        horizon_df = tables["Horizon Summary"].reset_index()
        plt.figure(figsize=(6, 4))
        sns.barplot(
            data=horizon_df,
            x="horizon",
            y="sharpe_avg",
            palette="Blues_d",
        )
        plt.title("Mean Sharpe by Horizon")
        plt.ylabel("Mean Sharpe")
        plt.tight_layout()
        horizon_path = plot_dir / "grid_sharpe_by_horizon.png"
        plt.savefig(horizon_path, dpi=200)
        plt.close()

        raw_df = tables["Raw"].copy()
        plt.figure(figsize=(6, 4))
        sns.scatterplot(
            data=raw_df,
            x="avg_daily_dollar_volume_30d",
            y="sharpe",
            hue="horizon",
            alpha=0.6,
        )
        plt.xscale("log")
        plt.xlabel("ADV30 (log scale)")
        plt.title("Sharpe vs Liquidity (ADV30)")
        plt.tight_layout()
        adv_path = plot_dir / "grid_sharpe_vs_adv30.png"
        plt.savefig(adv_path, dpi=200)
        plt.close()

        plt.figure(figsize=(6, 4))
        sns.boxplot(
            data=raw_df,
            x="band",
            y="sharpe",
            order=sorted(raw_df["band"].unique()),
        )
        plt.title("Sharpe distribution by band")
        plt.tight_layout()
        band_path = plot_dir / "grid_sharpe_by_band.png"
        plt.savefig(band_path, dpi=200)
        plt.close()

        print(
            "Generated plots:\n"
            f"  - {horizon_path}\n"
            f"  - {adv_path}\n"
            f"  - {band_path}"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
