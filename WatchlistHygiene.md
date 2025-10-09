# Watchlist Hygiene Checklist

This note captures the cleanup and enrichment work we should run on `ticker_universe` before expanding into new vectors. It’s split into focused buckets so we can batch changes, re-run QA quickly, and avoid ripples through downstream jobs.

## 1. Clean & Normalize
- [x] **Re-tier priorities:** Current `priority` values zigzag (e.g., SPY at 20 while lower-liquidity names sit at 2–5). Keep the numeric column but remap to contiguous ranges per tier (Core = 1–30, Satellite = 31–70, Experimental = 71+). Ship a follow-up update that clusters inactive rows at the bottom (priority ≥ 200) so they never collide with active tiers.
- [x] **Cull inactive clutter:** Keep `active = false` rows in-place; add `retired_reason`, `retired_at`, and exclude them via views so joins stay clean. Revisit each to decide whether to reactivate or archive later.
- [x] **Deduplicate + canonical names:** Confirm we only carry common share classes (no duplicate ADRs, preferreds). Standardize naming (`Inc.` vs `Inc`) so UI filters and joins don’t splinter.
  - Status: Snapshot 2025-09-30 shows 0 duplicate `symbol` entries, only common share classes in the universe, and naming conventions consistent across the set.
  - Next: When adding symbols, run the quick dedupe query (`SELECT symbol, COUNT(*) FROM ticker_universe GROUP BY symbol HAVING COUNT(*) > 1`) and normalize the display name before insert so the checklist stays green.
- [x] **Sector sanity check:** Align to GICS or internal taxonomy so sector pivots and dashboards stay coherent.
  - Status: Updated `TTD → Communication Services`, `CHPT → Consumer Discretionary`, `QS → Consumer Discretionary`, `SNDL → Health Care`.
  - Next: Wire a sector validation step into the intake job (compare against reference feed) and fail the insert/update when a mismatch appears.

## 2. Enrich with Trading Signals
- [x] **Liquidity profile:** Add `avg_daily_dollar_volume_30d`, `shares_float`, and `short_interest_pct_float` so entry sizing, borrow checks, and squeeze logic can run off the universe itself.
  - Status: Polygon backfill + edge job now refresh `avg_daily_dollar_volume_30d` nightly; `shares_float` populated via fundamentals; short-interest/borrow deferred to a later sprint.
- [x] **Volatility & regime:** Persist `atr_14d`, `true_range_pct`, and `beta_vs_spy` so we can pre-filter for the high-volatility vector and detect when a name cools off.
  - Status: Metrics computed during backfill and by the Polygon cron for all active tickers.
- [x] **Sentiment coverage:** Track `reddit_msgs_30d`, `stocktwits_msgs_30d`, and data-latency health metrics. Only promote symbols with reliable coverage into the Core tier.
  - Status: `refresh_sentiment_coverage()` job (hourly via pg_cron) updates 30-day counts + health score in `ticker_universe`; next, layer alerting on job failures.
- [ ] **Operational flags:** Store `primary_exchange`, `listing_status`, `hard_to_borrow_flag`, and `borrow_cost_bps` to keep compliance/risk constraints in view.

## 3. Automate Stewardship
- **Universe refresh job:** Nightly job that re-computes enrichment fields, re-scores tiers, and emits a diff report (new entrants, drops, status flips).
- **Quality gates:** Before a symbol goes active, enforce min price ($10), ADV ($200M), sentiment coverage thresholds, and data-health checks; fail closed until all pass.
- **Change log:** Append adjustments to a `universe_changelog` table with who/why/when so experiments remain auditable.
- **Backfill audit:** For any ticker we deactivate, flag downstream warehouses (price history, sentiment) to stop churn and reclaim storage.

## 4. Candidate Intake & Expansion
- **Screening pass:** Pull a fresh list of high-liquidity, high-volatility symbols that meet the Core gates (price ≥ $10, ADV ≥ $200M, 30/90-day vol percentiles ≥ 70). Focus on sectors where we need more catalysts (semis breadth, high-beta financials, AI suppliers).
- **Coverage check:** Cross-reference candidates with Reddit/StockTwits history; deprioritize names with sparse chatter so sentiment models don’t go dark.
- **Intake sheet:** For each finalist, capture metadata, liquidity stats, sentiment snapshots, upcoming catalysts, and compliance notes. Promote to Core/Satellite only after replaying our existing rules and verifying Sharpe/drawdown against baseline.
- **Universe cap:** Maintain ~60 Core + 40 Satellite slots. When promoting a name, demote or retire a stale one so monitoring and alerting stay manageable.

## 5. Populate New Columns (ETL Roadmap)
- [x] **Polygon daily job enhancements:** Extend the `polygon-market-data` edge function (already on a Supabase cron) to pull 60 days of bars per symbol, compute ADV30, ATR14, true_range_pct, and beta vs SPY, then upsert those stats into `ticker_universe`. Hit Polygon fundamentals endpoints to hydrate shares_float, short_interest_pct_float, borrow_cost_bps, and hard_to_borrow_flag in the same run.
- [x] **Backfill script:** Add a one-off backfill runner (Node script or Supabase function) that iterates the current universe, calls the enhanced Polygon job with `days=120`, and patches any NULL metrics. Log progress so we can rerun failed symbols.
- [ ] **Data staging:** Cache raw Polygon JSON in `storage` or S3 for traceability, and stage intermediate calculations in `enhanced_market_data` so dashboards can debug discrepancies between intraday pulls and aggregated stats.

- [ ] **Sentiment rollups:** Update `reddit-utils/reddit_pipeline.sh` (and the Stocktwits cron) to compute `reddit_msgs_30d`, `stocktwits_msgs_30d`, and a `sentiment_health_score`. Schedule nightly so counts stay fresh.
- [x] **Market data enrichments:** Extend the price/volatility ETL to pull `avg_daily_dollar_volume_30d`, `atr_14d`, `true_range_pct`, `beta_vs_spy`, plus `shares_float`, `short_interest_pct_float`, and `borrow_cost_bps` from your market data vendor.
  - Status: 60-day Polygon backfill complete for all active tickers (ADV30, ATR14, TR%, beta updated in `ticker_universe`).
  - Deferred: `shares_float` populated via Polygon fundamentals; short-interest/borrow columns still null—documented as later enhancement.
- [ ] **Operational flags:** Add exchange/listing/borrow flags in the same run; validate values against broker metadata so compliance filters don’t drift.
- [ ] **Priority normalization:** After enrichment, run the remap script to keep Core 1–30, Satellite 31–70, Experimental 71+, and inactive names ≥ 200. Emit a diff report for audit.
- [ ] **QA & dashboards:** Backfill missing values, spot-check a sample (ADV, sentiment counts, borrow flags) against raw feeds, and update any Looker/Supabase dashboards that surface the new fields.
  - Suggested spot check: pick one name per cohort (e.g., AAPL, NVDA, META, NET, SOFI, GOOGL) and verify ADV/ATR/beta against Polygon portal or cached JSON before the nightly cron promotes new metrics.
  - Status update: Grid backtests and promotion SQL now persist the new liquidity/volatility/sentiment columns, so downstream reports see the same hygiene signals surfaced in `ticker_universe`.

## 6. Future Priority Scoring
- **Composite score:** Once enrichment lands, shift the ranker from `priority, symbol` to a score blending liquidity, volatility, sentiment coverage, and backtest quality. Example: `w1*liquidity_rank + w2*volatility_rank + w3*sentiment_rank + w4*backtest_score` (all normalized 0–1).
- **Tiebreakers:** Use Reddit/StockTwits volume as a secondary tie breaker; enforce minimum coverage so low-chatter names remain in Satellite/Experimental.
- **Re-rank cadence:** Recompute scores with the nightly refresh job and keep Core/Satellite buckets aligned with strategy needs (still 1–30, 31–70). Log score deltas in `universe_changelog` once that table is live.

Once the cleanup pass is done and the intake loop is humming, re-run recent backtests to quantify how much the hygiene work improves signal quality and iterate on the cohort rules.
