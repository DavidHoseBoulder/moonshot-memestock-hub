# Pipeline Optimizations Workplan

This doc tracks concrete improvements to the backtesting → promotion → seeding pipeline. It expands on the overview in `BACKTESTING_PIPELINE.md` with actionable tasks, flags, and validation steps.

## Goals

- Improve robustness (reduce overfitting, add guardrails).
- Improve transparency (persist artifacts, baseline comparisons).
- Improve operability (clear flags, safe reruns, health checks).

## Workstreams

### 8) Mentions Build Performance (cashtags + keywords)

- Summary: Optimize `insert_mentions_window.sql` to reduce regex load and rescans; speed up backfills and metadata propagation (author/subreddit/karma).
- Changes (2025-09-21):
  - Stage posts/comments once per window into a temp table `tmp_base_docs`; reuse for both cashtag and keyword paths.
  - Posts source: switch to `v_scoring_posts_union_src` and dedupe within-window via `SELECT DISTINCT ON (post_id) ... ORDER BY created_utc DESC` after filtering by date.
  - Cashtags: prefilter with `LIKE '%$%'` via filtered CTEs so LATERAL regexp only runs when text contains a dollar sign.
  - Keywords: replace cross-join with tokenization + join to `ticker_universe`; dedupe tokens per doc before join.
  - Upserts: `ON CONFLICT` refreshes metadata and now includes a `WHERE ... IS DISTINCT FROM ...` guard to avoid no-op updates.
  - Session knobs: `SET LOCAL work_mem = '128MB'; SET LOCAL jit = off;` and `ANALYZE tmp_base_docs` for better in-memory sorts and planning.
- Results:
  - v3 EXPLAIN shows sub-second execution per day; cashtags ~6 ms, keywords ~600 ms on ~2.5k-doc day; in-memory sorts, no external merges.
  - Full-day backfill windows (30–90 days) complete quickly; re-runs cleanly propagate late author metadata.
- Follow-ups:
  - Keep EXPLAIN scripts out of repo; re-generate ad hoc when profiling.
  - Consider `VACUUM (ANALYZE) public.reddit_mentions` after large backfills.

### 1) Full-Grid Persistence

- Summary: Persist the entire sweep grid so promotion can evaluate neighborhoods against full data, not only winners.
- SQL touchpoints: `backtest_grid.sql`
- DDL: New table `backtest_sweep_grid` with indexes.
- Flags: `PERSIST_FULL_GRID=1` to enable writes.
- Tasks:
  - [x] Create table `backtest_sweep_grid` if not exists.
  - [x] Insert `tmp_results` with `(model_version, start_date, end_date)` on grid runs.
  - [x] Add indexes on `(model_version,start_date,end_date)` and `(symbol,horizon,side)`.
  - [x] Add `ANALYZE backtest_sweep_grid` after inserts on large runs.
- Validation:
  - [x] Row count equals `tmp_results` for run window.
  - [x] Spot-check 3 symbols for metric parity.

Schema sketch:

```sql
CREATE TABLE IF NOT EXISTS backtest_sweep_grid (
  model_version text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  symbol text NOT NULL,
  horizon text NOT NULL,
  side text NOT NULL,
  min_mentions int2 NOT NULL,
  pos_thresh numeric NOT NULL,
  trades int NOT NULL,
  avg_ret numeric,
  median_ret numeric,
  win_rate numeric,
  stdev_ret numeric,
  sharpe numeric,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (model_version,start_date,end_date,symbol,horizon,side,min_mentions,pos_thresh)
);
CREATE INDEX IF NOT EXISTS idx_bsg_model_window ON backtest_sweep_grid (model_version,start_date,end_date);
CREATE INDEX IF NOT EXISTS idx_bsg_group ON backtest_sweep_grid (symbol,horizon,side);
```

### 2) Promotion Neighbor Checks (use full grid)

- Summary: When available, compute neighborhood robustness over `backtest_sweep_grid` instead of winners.
- SQL touchpoints: `promote_rules_from_grid.sql`
- Flags: `USE_FULL_GRID=1` to enable; fallback to `backtest_sweep_results` when off or absent.
- Tasks:
  - [x] Read `USE_FULL_GRID` psql var; branch source CTE accordingly.
  - [x] Parameterize epsilons: `NEIGHBOR_POS_EPS`, `NEIGHBOR_MM_EPS`, `MIN_NEIGHBORS`, `SHARPE_FRAC`.
  - [x] Compute neighbor stats per (symbol,horizon,side) around a candidate cell.
- Validation:
  - [x] Unit compare neighborhood counts vs. winners-only mode on 2 windows.
  - [x] Ensure gating decision flips only for brittle cells.

### 3) Train/Validation Folds + Rank Stability

- Summary: Split by time within window; require stability across folds and optional top-k rank consistency.
- SQL touchpoints: `backtest_grid.sql`
- Flags: `USE_FOLDS=1`, `RANK_TOP_K=3`.
- Tasks:
  - [x] Add fold assignment by date quantile (e.g., 70/30).
  - [x] Compute per-fold metrics; expose in results.
  - [x] Optional: compute ranks per fold; include diagnostics (`r_train_rank`, `r_valid_rank`).
- Validation:
  - [x] Confirm per-fold Sharpe and ranks appear in CSV.
  - [ ] Sanity-check that extreme cells fail stability more often.

### 4) Lower-Bound CI Metrics (LB)

- Summary: Rank by conservative mean lower bound and optionally gate on `LB > 0`.
- SQL touchpoints: `backtest_grid.sql`, `promote_rules_from_grid.sql`
- Flags: `LB_Z=1.64`, `USE_LB_RANKING=0/1`, `REQUIRE_LB_POSITIVE=0/1`.
- Tasks:
  - [x] Compute `LB = avg_ret - :LB_Z * stdev / sqrt(trades)`.
  - [x] Add to outputs and sort by LB when `USE_LB_RANKING=1`.
  - [x] Optional gate in grid/promotion when enabled.
- Validation:
  - [x] Compare top-10 under SHARPE vs LB on 1–2 symbols.

### 5) Multiple Testing Control (BH FDR)

- Summary: Control false discoveries within each (symbol,horizon,side) partition.
- SQL touchpoints: `backtest_grid.sql` (stats) or promotion step.
- Flags: `Q_MAX=0.10`.
- Tasks:
  - [x] Compute p-values from t-stat or bootstrap; derive `q_value` via BH.
  - [x] Expose `q_value` in grid outputs; gate promotion at `q_value <= :Q_MAX`.
- Validation:
  - [ ] Ensure increasing grid size tightens acceptance.

### 6) Baseline Comparisons and Uplift

- Summary: Always report naive and random baseline alongside rule metrics.
- SQL touchpoints: helper CTE(s) or `backtest_baselines.sql`.
- Flags: `REQUIRE_UPLIFT_POSITIVE=0/1`.
- Tasks:
  - [x] Implement naive sentiment baseline (same horizons/window).
  - [x] Optional random baseline matching counts per day/horizon.
  - [x] Compute `uplift = avg_ret_rule - avg_ret_baseline` (in grid outputs).
- Validation:
  - [x] Include baseline and uplift columns in promotion summary.

### 7) Score Bands and Sizing

- Summary: Band sentiment strength and carry into promotion notes and optional position sizing.
- SQL touchpoints: `backtest_grid.sql`, `seed_paper_trades_rules_only.sql`
- Flags: `BAND_STRONG=0.35`, `BAND_MODERATE=0.20`, `BAND_WEAK=0.10`, `DPT_BY_BAND='STRONG:1.5,MODERATE:1.0,WEAK:0.5'`.
- Tasks:
  - [x] Add `band` to grid outputs (derived from `pos_thresh`) and include in CSV.
  - [x] Optional: scale DPT in seeding by band factors.
  - [x] Surface promotion-report aggregates by band (counts, Sharpe, avg_ret, q-pass) for capital allocation decisions.
- Validation:
  - [x] Verify inserts reflect expected DPT multipliers when enabled.

### 8) Nightly Health Checks (Auto-disable)

- Summary: Disable rules when recent live performance degrades; add provenance notes.
- SQL touchpoints: new script `disable_degrading_rules.sql` + runner.
- Flags: `MIN_WIN_15=0.45`, `MIN_SHARPE_20=0.0`.
- Tasks:
  - [ ] Implement rolling window metrics over last N signals per rule.
  - [ ] Update `is_enabled=false` with note when thresholds breached.
  - [ ] Provide dry-run mode.
- Validation:
  - [ ] Backfill test on historical live rules and inspect diffs.

### 9) Subreddit/Author Enrichment & Author Coverage Controls *(paused – revisit after author cohorts mature)*

- Summary: Capture subreddit/author quality signals and coverage stats. Core diagnostics in place; remaining gating work deferred until more live author data lands.
- SQL touchpoints: ingestion → `reddit_mentions` → `v_entry_candidates`, `backtest_grid.sql`, promotion helpers.
- Flags (proposed): `REQUIRE_AUTHOR_PRESENT=0/1`, `MIN_AUTHOR_COVERAGE=0.50`, `AUTHOR_TIER_WEIGHTING='A:1.0,B:0.8,C:0.5'`.
- Completed
  - [x] Ensure `subreddit`, `author`, `author_karma`, `doc_type` flow end-to-end.
  - [x] Add diagnostics tables: perf by subreddit band and author tiers.
  - [x] Validate perf breakdowns render with sensible distributions.
- Deferred (q4 revisit)
  - [ ] Persist author coverage metrics per backtest window (`author_coverage_pct`, `missing_author_count`).
  - [ ] Parameterize optional backtest filters (`REQUIRE_AUTHOR_PRESENT`, `MIN_AUTHOR_COVERAGE`, `AUTHOR_TIER_WEIGHTING`).
  - [ ] Surface coverage + tier mix in promotion reports/seed notes.
  - [ ] Run `REQUIRE_AUTHOR_PRESENT=1` backtest and align coverage metrics with Supabase spot checks.

### 10) Traditional TA Gates (volume_zscore & RSI)

- Summary: Add optional technical-analysis gates (volume z-score, RSI) on top of sentiment without changing default behavior.
- SQL touchpoints: `enhanced_market_data`, `v_market_rolling_features` (new), `v_triggered_with_backtest`, `backtest_sweep_grid`, `backtest_sweep_results`, `live_sentiment_entry_rules` (via diagnostics view).
- Tasks:
  - Rolling features
    - [x] Create view/materialized view `v_market_rolling_features` with `volume_zscore_20`, `rsi_14`, NULL when window incomplete; handle zero-variance volume.
    - [ ] If matview chosen, add `(symbol,data_date)` index and refresh helper.
  - Candidate plumbing
    - [x] Surface rolling features in the grid candidate pipeline (`tmp_candidates`/`tmp_sig_start`) so sentiment rules carry `volume_zscore_20`, `rsi_14` forward.
  - Sweep gates
    - [x] Extend sweep params/table with `min_volume_z`, `rsi_long_max`, `rsi_short_min` (nullable defaults) and apply filters only when provided.
    - [x] Add presets/runner helpers covering baseline, volume-only, RSI-only, combo scenarios.
  - Live diagnostics
    - [ ] Create view `v_live_rules_effective` with TA pass/fail diagnostics joined to `live_sentiment_entry_rules` (no gating yet).
  - Reporting & regression
    - [ ] Publish `v_backtest_ta_summary` and baseline-vs-gated comparison view for quick QA.
  - Guardrails & rollback
    - [ ] Document DROP/DROP COLUMN rollback script covering all TA artifacts.
    - [ ] Capture performance assertions (baseline parity, trade-count deltas) in runbook.
- Validation:
  - [ ] Spot-check rolling metrics (AAPL) for NULL windows and RSI bounds.
  - [ ] Ensure baseline runs (TA params NULL) match historical stats within tolerance.
  - [ ] Confirm diagnostic views populate booleans for current rules and regression summary reflects gate tightening.

Notes (2025-09-24): Migration `2025-09-24_add_market_rolling_features.sql` is live; grid pipeline now forwards `volume_zscore_20`/`volume_ratio_avg_20`/`volume_share_20`/`rsi_14`, and `promote_rules_from_grid.sql` surfaces the averages in promotion notes. `run_backtest_grid.sh` accepts direct TA knobs (`MIN_VOLUME_Z`, `MIN_VOLUME_RATIO`, `MIN_VOLUME_SHARE`, `VOLUME_RATIO_PCTL`, `VOLUME_SHARE_PCTL`, `RSI_LONG_MAX`, `RSI_SHORT_MIN`) plus `TA_PRESET` helpers (`baseline`, `volume_only`, `rsi_only`, `combo`). Baseline rerun reproduced 29 winners/727 grid rows. `volume_only` with `MIN_VOLUME_Z` at 0.50, 0.20, 0.10, 0.05, and even 0.02 all collapse to the same 3 GME pockets / 72 grid rows (LB<0); per-symbol volume_zscore p80 rarely exceeds ~0.3 for core names, so absolute z-gates are unusable. Ratio profiling shows p80 ≈1.2–1.3 for large caps (SOFI 1.18, AAPL 1.20, GOOGL 1.22, TSLA 1.15) with winner means ~1.1–1.3 and share means ~0.5–0.6. RSI-only with relaxed caps (`RSI_LONG_MAX=80`, `RSI_SHORT_MIN=25`) held 24 winners/521 grid rows with solid uplift. New `validation/sweep_volume_ratio.sql` sweeps global ratio/share thresholds and per-symbol percentiles; use `VOLUME_RATIO_PCTL`/`VOLUME_SHARE_PCTL` for symbol-aware gates. First pass at percentile gating (`VOLUME_RATIO_PCTL=0.55`, `VOLUME_SHARE_PCTL=0.55`) plus `REQUIRE_LB_POSITIVE=1` shrank the window to a single LB-positive HOOD 5d pocket (trades=11, avg_ret≈4.6%), removing negative-LB GME/TSLA pockets while leaving 168 pockets in the full grid (vs. 765 baseline). Next validation: compare aggregate metrics

Analysis (2025-09-24):
- Baseline vs. `pct55_share55_lb`: trades 15,118→2,139, avg_ret 0.01198→0.00699, Sharpe 0.2535→0.0933, median_ret 0.00792→0.00097, win_rate 0.582→0.511; LB improved, but returns shrank.
- Scenario sweep (`ta_scenario_summary`): `pct45_lb` retains ~5.2k trades with Sharpe ≈0.065; tighter gates (≥0.55) drive Sharpe toward zero/negative despite LB filtering.
- No volume percentile tested yet boosts Sharpe; next experiments: adjust share percentiles (0.40–0.50), combine ratio pct with mild global floors (1.00–1.05), clamp RSI (e.g., `RSI_LONG_MAX=65`), and add drawdown/ATR filters.
- Use `validation/run_ta_scenarios.sh` + `validation/ta_scenarios.tsv` to iterate; inspect `ta_scenario_summary` after each sweep before baking TA presets or promotion gates. Baseline vs. TA_pct55 snapshot: trades 15,118→2,139, avg_ret 0.01198→0.00699, Sharpe 0.2535→0.0933, median_ret 0.00792→0.00097, win_rate 0.582→0.511—LB quality improved but overall returns shrunk, so thresholds need refinement before adoption. Use `validation/ta_scenarios.tsv` + `validation/run_ta_scenarios.sh` to batch-test ratio/share combinations and capture `ta_scenario_summary` metrics for comparison. (avg_ret, Sharpe, LB, drawdowns) for baseline vs. gated runs to confirm uplift before standardising thresholds (e.g., ratio pct 0.55–0.60, share pct 0.50–0.55) and wiring them into a TA preset/promotion flow. Baseline vs. TA_pct55 snapshot: trades 15,118→2,139, avg_ret 0.01198→0.00699, Sharpe 0.2535→0.0933, median_ret 0.00792→0.00097, win_rate 0.582→0.511—LB quality improved but overall returns shrank, so thresholds need refinement before adoption.
Next scenario passes to try

Moderate percentile + soft share floor

VOLUME_RATIO_PCTL=0.45, VOLUME_SHARE_PCTL=0.40, REQUIRE_LB_POSITIVE=1.
Goal: keep HOOD-type winners but drop low-share, low-LB names.
Percentile + mild global floor

VOLUME_RATIO_PCTL=0.50, MIN_VOLUME_RATIO=1.02, REQUIRE_LB_POSITIVE=1.
Tests whether a gentle per-symbol gate plus a weak absolute floor can preserve Sharpe.
Add RSI clamp

Extend the TSV with a column for RSI_LONG_MAX (e.g., 65) and rerun. We can expand the script to pass that env var and log it in the summary.
Volatility / drawdown filters

Consider adding ATR- or drawdown-based gates (e.g., require ATR percentile or cap rolling max drawdown) to see if they improve Sharpe more than volume alone.
Additional indicators to test

Moving average slope/crossovers, MACD/ROC for momentum confirmation.
Bollinger-band position (mean reversion).
Multi-timeframe volume ratios (e.g., 5-day vs. 20-day).
Relative strength vs. sector ETF or the market index.
Volume Spike + Sentiment Intensity combos (e.g., percentile + sentiment z-score).

## Rollout Plan

- Phase 1: Full-grid persistence + neighbor checks (feature flagged).
- Phase 2: Add folds and LB metrics (diagnostics only).
- Phase 3: Enable LB gating and BH FDR for promotion.
- Phase 4: Baselines + bands into promotion output; optional sizing.
- Phase 5: Nightly health checks; enrichment diagnostics.

## Runners and Flags (summary)

- Grid: `run_backtest_grid.sh` with `PERSIST_FULL_GRID`, `USE_FOLDS` (alias for `REQUIRE_STABLE`), `LB_Z`, `USE_LB_RANKING`, `REQUIRE_LB_POSITIVE`, `REQUIRE_UPLIFT_POSITIVE`, band thresholds.
- Promotion: `run_promote_rules_from_grid.sh` with `USE_FULL_GRID`, `Q_MAX`, `REQUIRE_LB_POSITIVE`, neighbor eps.
- Seeding: `run_seed_paper_trades_rules_only.sh` with optional `DPT_BY_BAND`.
- Health: `run_disable_degrading_rules.sh` (new).

### Table Guardrails (backtest_sweep_grid)

- Unique key: `(model_version, start_date, end_date, symbol, horizon, side, min_mentions, pos_thresh)`.
- Indexes: `(model_version,start_date,end_date)`, `(symbol,horizon,side)`; optionally `(min_mentions,pos_thresh)` or `(symbol,horizon,side,min_mentions,pos_thresh)`.
- Constraints (consider via migrations): `CHECK (trades >= 0)`, `CHECK (win_rate BETWEEN 0 AND 1)`, constrain `horizon` to `('1d','3d','5d')`, `side` to `('LONG','SHORT')`.
- Provenance: optional `window_id` (hash of model+window) and robustness fields like `robust_neighbors`, `neighbor_eps_pos`, `neighbor_eps_mm`.

## Open Questions

- Preferred p-value computation source: analytical vs. bootstrap?
- Band thresholds per model or global?
- Separate tables per model_version window vs. single table with compound key?

## Status Update (2025-09-15)

- Full-grid persistence: Implemented and write-enabled via `PERSIST_FULL_GRID` in `backtest_grid.sql`; runner forwards flag.
- Folds and diagnostics: Implemented; runner supports `USE_FOLDS`, `FOLD_FRAC`, and optional rank consistency flags; CSV includes per-fold metrics and ranks.
- Lower-bound and uplift: Implemented; runner supports `LB_Z`, `USE_LB_RANKING`, `REQUIRE_LB_POSITIVE`, `REQUIRE_UPLIFT_POSITIVE`.
- Bands: Emitted in CSV; thresholds configurable in runner via `BAND_STRONG`, `BAND_MODERATE`, `BAND_WEAK`.
- Promotion FDR: Implemented BH-based `q_value` with `Q_MAX` gating; runner forwards `Q_MAX`.
- Promotion report: Added `promotion_report.sql` for auditing promoted rules, neighbor counts, and FDR margins.
- Promotion baselines: `promotion_report.sql` now surfaces naive/random baseline comparisons (per-rule and aggregate) for the promoted set.
- Post-seeding hygiene: Tail review workflow documented in `BACKTESTING_PIPELINE.md`; manual rule tightening via direct updates to `live_sentiment_entry_rules` now part of close-out.
- Seeding dry-run: `seed_paper_trades_rules_only.sql`/runner accept `DRY_RUN=1` plus `DPT_BY_BAND` overrides, emitting band-factor summaries without writing to `trades`.
- Enrichment diagnostics: `diagnostics/trade_mentions_enrichment.sql` defines `v_trade_mentions_primary`, `v_trade_perf_by_subreddit`, and `v_trade_perf_by_author_tier` for monitoring subreddit/author signal health without gating trades yet.

## Pre-TA Close-Out Checklist (2025-09)

- **Full-grid parity validation** *(done)*: `logs/validate_full_grid_2025-06-01_2025-09-15.log` shows `tmp_results` vs. `backtest_sweep_grid` counts match (4,567) and spot-check parity for AAPL/TSLA/AMD.
- **Neighbor diff artifact** *(done)*: `logs/compare_neighbor_modes_2025-06-01_2025-09-15.log` records 15 winner pockets vs. 6 full-grid survivors with explicit `lost_with_full_grid` / `gained_with_full_grid` cases.
- **Fold diagnostics audit** *(done)*: validation log confirms train/valid Sharpe and rank columns populate for 964 pockets; annotate unstable pockets directly from the report.
- **LB vs. Sharpe review** *(done)*: validation log contains the LB vs. Sharpe comparison highlighting demotions (TSLA shorts, GME longs) under LB ordering.
- **FDR tightening evidence** *(done)*: validation log reports trimmed vs. wide acceptance counts (both 345) for the window.
- **Random baseline stub** *(done)*: rerun `promotion_report.sql` (see `reddit-utils/promotion_report.sql`) to capture the new `Baseline uplift summary` block plus per-rule naive/random deltas (e.g., `psql "$PGURI" ... -f promotion_report.sql > reddit_work/logs/promotion_report_2025-06-01_2025-09-15.log`).
- **Band-driven DPT scaling** *(done)*: use the new `DRY_RUN=1` runner flag with `DPT_BY_BAND` overrides (e.g., `STRONG:1.5,MODERATE:1.0,WEAK:0.5`) to validate `band_factor`/qty multipliers in-place. Diagnostics emit via `-- Final inserts band summary --` and, when `DEBUG=1`, persist to `dbg_final`.
- **Subreddit/author enrichment prep**: plumb fields through staging tables and generate preliminary perf slices; hold off on gating until distributions reviewed.

### Validation Helpers

- `validation/validate_full_grid.sql`: wraps `backtest_grid.sql`, then reports grid-vs-persistence parity, fold diagnostics coverage, LB vs. Sharpe rank flips, and FDR acceptance deltas. Example: `cd "$CODE_DIR/validation" && psql "$PGURI" -v MODEL_VERSION='gpt-sent-v1' -v START_DATE='2025-06-01' -v END_DATE='2025-09-15' -v PERSIST_FULL_GRID=1 -v DO_PERSIST=0 -v USE_FOLDS=1 -v REQUIRE_STABLE=1 -v SHARPE_FRAC=0.70 -v SAMPLE_SYMBOLS='AAPL,TSLA,AMD' -f validate_full_grid.sql > "$WORKING_DIR/logs/validate_full_grid_2025-06-01_2025-09-15.log"`.
- `validation/compare_neighbor_modes.sql`: replays promotion logic against `backtest_sweep_results` vs. `backtest_sweep_grid` and surfaces neighbor counts, q-values, and promotion flips. Example: `cd "$CODE_DIR/validation" && psql "$PGURI" -v MODEL_VERSION='gpt-sent-v1' -v START_DATE='2025-06-01' -v END_DATE='2025-09-15' -v MIN_TRADES=10 -v MIN_SHARPE=0.40 -v MIN_WIN_RATE=0.55 -v MIN_AVG_RET=0.00 -v NEIGHBOR_POS_EPS=0.05 -v NEIGHBOR_MM_EPS=1 -v MIN_NEIGHBORS=1 -v SHARPE_FRAC=0.75 -v REQUIRE_ROBUST=1 -v Q_MAX=0.10 -f compare_neighbor_modes.sql > "$WORKING_DIR/logs/compare_neighbor_modes_2025-06-01_2025-09-15.log"`.
