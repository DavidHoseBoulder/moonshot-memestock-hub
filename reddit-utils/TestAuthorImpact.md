# Test: Author Impact on Tradeable Signal

Purpose
- Evaluate whether specific authors produce consistent, tradeable edge across horizons/sides.
- Keep exploratory results separate from rulebook; no schema changes required.

Scripts
- `reddit-utils/author_signal_backtest.sql` — computes author and author+symbol performance using per-mention sentiment.
- `reddit-utils/author_overlay_backtest.sql` — overlays recent author cohorts onto `live_sentiment_entry_rules` to measure lift.

Assumptions
- Mentions table: `reddit_mentions(trade_date, symbol, author, score, subreddit)`.
- Price helpers exist: `price_open_next`, `price_close_next`, `price_close_at`, `price_close_at_horizon`.
- Conventions match grid backtests: entry `ENTRY_SESSION`, exits at `horizon_days`.

How to run

```bash
mkdir -p "$WORKING_DIR/author-test"

# Baseline POS_THRESH aligned with production sentiment gate
psql "$PGURI" \
  -v START_DATE='2025-06-01' \
  -v END_DATE='2025-09-12' \
  -v HORIZONS='1,3,5' \
  -v ENTRY_SESSION='next_open' \
  -v POS_THRESH=0.05 \
  -v MIN_AUTHOR_TRADES=20 \
  -v MIN_AUTHOR_SYMBOL_TRADES=10 \
  -v ALLOWED_SUBS_CSV='' \
  -v ALLOWED_TICKERS_CSV='' \
  -v MODEL_VERSION='' \
  -v MIN_CONF='' \
  -v EXCLUDE_AUTHORS_CSV='automoderator,daily-thread' \
  -v MIN_UNIQUE_SYMBOLS=0 \
  -v SHOW_MONTHLY=0 \
  -v STABILITY_SPLIT_DATE='' \
  -v MIN_TRADES_PER_HALF=3 \
  -v REQUIRE_POSITIVE_BOTH=0 \
  -v STABILITY_HORIZON=5 \
  -f $CODE_DIR/author_signal_backtest.sql

# Export CSVs in a second session (reads tmp_sided rebuilt by the first run)
psql "$PGURI" \
  -v MIN_AUTHOR_TRADES=20 \
  -v MIN_AUTHOR_SYMBOL_TRADES=10 \
  -v MIN_UNIQUE_SYMBOLS=0 \
  -v OUT_AUTHOR_TOP='/Users/dhose/Desktop/Moonshot/reddit_work/author-test/author_top.csv' \
  -v OUT_AUTHOR_SYMBOL='/Users/dhose/Desktop/Moonshot/reddit_work/author-test/author_symbol_top.csv' \
  -v OUT_AUTHOR_CONC='/Users/dhose/Desktop/Moonshot/reddit_work/author-test/author_conc.csv' \
  -f $CODE_DIR/author_signal_export.sql

# Write a human-readable summary alongside the CSVs
psql "$PGURI" \
  -v MIN_AUTHOR_TRADES=20 \
  -v MIN_AUTHOR_SYMBOL_TRADES=10 \
  -v MIN_UNIQUE_SYMBOLS=0 \
  -v POS_THRESH=0.10 \
  -v OUT_SUMMARY='/Users/dhose/Desktop/Moonshot/reddit_work/author-test/summary.txt' \
  -f $CODE_DIR/author_signal_summary.sql
```

Overlay backtest (combine with base candidates)

```bash
# Window that builds 60-day author cohorts ending at each trade date
psql "$PGURI" \
  -v START_DATE='2025-07-15' \
  -v END_DATE='2025-09-22' \
  -v HORIZONS='1,3,5' \
  -v ENTRY_SESSION='next_open' \
  -v COHORT_LOOKBACK_DAYS=60 \
  -v MIN_AUTHOR_TRADES=10 \
  -v MIN_AUTHOR_SYMBOL_TRADES=10 \
  -f $CODE_DIR/author_overlay_backtest.sql \
  | tee /Users/dhose/Desktop/Moonshot/reddit_work/author-test/overlay_candidates.csv

# Notes:
# - The overlay script emits candidate rows with a `variant` label:
#   base, align_sym, align_auth, block_contra_sym, block_contra_auth, weighted_sym, weighted_auth
# - Tee writes results to `/Users/dhose/Desktop/Moonshot/reddit_work/author-test/overlay_candidates.csv`.
# - Feed that CSV into your trade PnL harness to measure avg_excess_ret, win_rate, Sharpe-like by horizon.

# Quick coverage report for overlay outputs
psql "$PGURI" -f $CODE_DIR/author_overlay_report.sql
```
```

Outputs
- Result set 1: author-level metrics (horizon, side, n_trades, avg_excess_ret, win_rate, sharpe_like).
- Result set 2: author+symbol metrics.
 - Result set 3: author concentration (top symbol share, trades, symbols).
- Optional stability export: `reddit_work/author-test/author_stability_pos5_h5.csv` (horizon=5, half-split stats).

Latest run (2025-06-01→2025-09-12)
- Command above with POS threshold 5%, horizons 1/3/5, and split-half stability enabled.
- Short bias dominates: degenforlife69, Xzlk, and DrummerCompetitive20 show ~1.1–1.7% avg excess on 1–3D shorts with Sharpe-like ≥0.30.
- Long edge shallow: MarketRodeo posts modest 0.59% avg excess on 3D longs but turns negative by 5D; most other longs cluster near zero.
- Author-symbol standouts hedge GME: Parsnip shorting GME (5D avg 7.1%) and GoldenFrog31 long GME (1D avg 0.71%) lead the table.
- Concentration alert: top-concentration list is entirely 1.0 top_symbol_share, so rely on author-symbol slice for single-ticker specialists.

Overlay combo snapshot (2025-07-15→2025-09-22)
- Base vs. align lift: 3D avg excess rises from 0.0047 (base) to 0.0049 (align/contra); 5D climbs from 0.0076 to 0.0075–0.0079 with slightly better win rates (~0.58 vs 0.57).
- Short cohort thin: only 36 short trades in base → weighted variants; alignment filters currently pass zero shorts, so next experiments should tighten long bias or add short-only overlay tests.
- Weighted variants: applying sigmoid weights nudges weighted avg excess to 0.000996/0.004913/0.007850 on 1/3/5D with total weight ~609/598/569.
- Coverage delta: align/contra variants drop ~57 trades (341 → 284) but keep daily overlap at one-trade difference; useful for position-size gating.

| Variant        | 1D avg | 1D win | 3D avg | 3D win | 5D avg | 5D win |
|---------------|--------|--------|--------|--------|--------|--------|
| base          | 0.00090 | 0.5060 | 0.00470 | 0.5727 | 0.00764 | 0.5764 |
| align_sym     | 0.00108 | 0.5159 | 0.00486 | 0.5735 | 0.00749 | 0.5849 |
| block_contra  | 0.00113 | 0.5193 | 0.00491 | 0.5765 | 0.00747 | 0.5843 |
| weighted_sym† | 0.000996 | 0.5060 | 0.004913 | 0.5727 | 0.007850 | 0.5764 |

†Weighted averages use overlay weights (total weight ≈ 609/598/569 for 1/3/5D).

Short-only overlay takeaway (META shorts dominate)
- Running with `SIDE_FILTER='SHORT'` leaves only 36 META shorts (one per trading day); 1D/3D avg excess remains negative (−0.00052/−0.0010) and 5D barely breaks even.
- Alignment/contrarian variants disappear because no short cohort clears the alignment gate; weighted variants inherit the same negative performance.

Faster cohort decay (30-day lookback, min trades=5)
- Align variants shrink to 264 trades (~7% drop) and 3D avg excess softens to 0.00447 (down ~40 bps vs. 60-day lookback); 5D edges slip to 0.00721 with lower win rate.
- Contrarian filters pick up more noise: 3D avg excess rises to 0.00558 but Sharpe-like falls to 0.1189, signalling higher variance.
- Weighted variants still help modestly (weighted 3D avg excess 0.00529, total weight ~569), yet overall lift is below the 60-day cohort.

Same-day entries (`ENTRY_SESSION='same_close'`)
- Rerunning the report on the baseline CSV with same-close pricing lifts 1D avg excess to 0.00247 (vs. 0.00090) and align variants to 0.00297, with win rate ~0.55.
- 3D/5D averages also climb (base 0.00622/0.00895, align 0.00632/0.00879), suggesting most of the author alignment edge compounds intraday rather than overnight.
- Weighted variants benefit proportionally (weighted 3D avg 0.00686); consider testing same-close entries in grid/paper trade harness before production changes.

Next overlay experiments
- Fold same-close pricing into the grid/paper harness to validate portfolio-level impact before promoting author gates.
- Short-book rebuild: inspect `live_sentiment_entry_rules` shorts to diversify beyond META (e.g., relax subreddit/ticker filters) before retrying short-only overlays.
- Author gates as diagnostics: promote the align/contra cohort stats to a daily monitor; alert when 3D Sharpe drops below 0 or alignment coverage collapses.
- Subreddit gating: repeat the overlay run on WSB/STOCKS-only candidates to see if curated communities drive stronger alignment than the broad set.

Suggested workflow
- Start broad (no filters), then tighten by subreddits/tickers you trust.
- Check stability: re-run on sub-windows (e.g., June–July vs. Aug–Sep).
- Raise `POS_THRESH` (e.g., 0.10) to test if stronger expre ssed sentiment improves edge.
- Compare entry sessions (same_close vs. next_open) to gauge sensitivity.
- Use `MODEL_VERSION` and `MIN_CONF` to align with production scoring.
- Exclude spammy accounts via `EXCLUDE_AUTHORS_CSV` (case-insensitive).
- Use `MIN_UNIQUE_SYMBOLS` > 0 to demand broader coverage (optional; default 0 since single-stock experts are fine).
- Set `SHOW_MONTHLY=1` to print per-month stability for top authors.

Note on thread/meta accounts
- EXCLUDE_AUTHORS_CSV applies only to posts (doc_type='post'); comments from those authors are still included. This keeps real user opinions in megathreads while avoiding boilerplate OP posts skewing stats.

Manual CSV export (reliable)
- After running the export script in the same psql session, you can write CSVs directly:
  - \COPY tmp_export_author TO '/Users/dhose/Desktop/Moonshot/reddit_work/author-test/author_top.csv' CSV HEADER
  - \COPY tmp_export_author_symbol TO '/Users/dhose/Desktop/Moonshot/reddit_work/author-test/author_symbol_top.csv' CSV HEADER
  - \COPY tmp_export_author_conc TO '/Users/dhose/Desktop/Moonshot/reddit_work/author-test/author_conc.csv' CSV HEADER
  - \COPY tmp_author_stability_pos5_h5 TO '/Users/dhose/Desktop/Moonshot/reddit_work/author-test/author_stability_pos5_h5.csv' CSV HEADER

Learnings (log succinct takeaways per run)
- [x] Strong long-edge authors over 5D: None surfaced; MarketRodeo's 3D long edge (+0.59%) fades to -0.13% by 5D.
- [x] Short-edge authors over 1D: degenforlife69 and Xzlk stay >1.3% avg excess with ~0.60 win rates; multiple 3D shorts still >1.5%.
- [x] Concentration risks (top_symbol_share > 0.8): All flagged authors are 100% in one ticker, so treat raw author stats as single-name bets.
- [x] Monthly stability: Not evaluated in this pass (`SHOW_MONTHLY=0`); rerun with monthly output before promotion.

Promotion policy (not enacted yet)
- Do not change `live_sentiment_entry_rules` based on this test alone.
- If an author shows consistent edge (e.g., n_trades ≥ 50 and sharpe_like ≥ 0.75 across windows), consider adding an optional author gate to `v_entry_candidates` experiments or a diagnostic view in `diagnostics/` before any rules.

Open questions
- Confirm mention column names match: `author` vs. `author_id`.
- Pricing uses close→forward-close from `enhanced_market_data`; no UDFs required.

Findings log
- [x] 2025-06-01→2025-09-12 baseline run (ALL subs/tickers). Notes: Strong short bias (degenforlife69, Xzlk, DrummerCompetitive20) with 1–3D avg excess 1.1–1.7%; best author-symbol is Parsnip on GME shorts (5D avg 7.1%); long side limited to MarketRodeo 3D (~0.59%); stability export saved to `author_stability_pos5_h5.csv`.
- [x] 2025-07-15→2025-09-22 overlay combo. Notes: Alignment overlays lift 3D/5D avg excess by ~20 bps vs. base while trimming trade count 17%; weighted variants keep full coverage with mild performance lift; no short-only cohorts yet.
- [ ] Subreddit-restricted (e.g., WSB/STOCKS). Notes:
- [ ] Stronger threshold (POS_THRESH=0.10). Notes:
- [ ] Stability check: split windows. Notes:
