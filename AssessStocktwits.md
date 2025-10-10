# Assessing StockTwits Impact Relative to Reddit Sentiment

## 1. Objective
- Determine whether StockTwits data provides incremental value over existing Reddit-driven sentiment for idea generation, signal quality, and trading outcomes.
- Quantify the trade-offs between additional coverage vs. pipeline cost (latency, rate limits, operational complexity).
- Produce an evidence-based recommendation on keeping, scaling, or trimming StockTwits ingestion.

## 2. Current State (from code + Lovable notes)
- **Ingestion**: `supabase/functions/stocktwits-data` pulls symbols from `symbol_disambig` + `ticker_universe`, paginates the StockTwits public API, dedupes, writes raw messages into `sentiment_history` (source=`stocktwits`).
- **Throughput guardrails**:
  - Up to 15 symbols per function invoke; <=200 msgs/symbol (default 25 msg/day) with 25-msg API pages.
  - 800ms pause between pages; 1.2s pause between symbols.
  - Serial execution only; no parallel fetches.
- **Caching behavior**: First checks `sentiment_history` for recent StockTwits entries; only hits the API for symbols lacking data within the lookback window.
- **Downstream usage**:
  - Pipeline aggregator (`src/components/DailyTradingPipeline.tsx`) and dev tooling (`src/pages/ExtractionTester.tsx`) request StockTwits sentiment alongside Reddit, News, Twitter, YouTube, Google Trends.
  - Sentiment quality dashboards monitor StockTwits coverage and weight it in normalization (`SentimentNormalizer`, `SentimentDataProcessor`).
- **Limitations**:
  - Edge function is a 300+ line monolith, no integration with the `SentimentBatchProcessor` utilities (multi-timescale smoothing, redundancy, staggered batching).
  - Rate limits create long per-run latency; UI can hang while waiting for responses.
  - No higher-order analytics (bullish/bearish scoring, per-user weighting) beyond raw message capture.

## StockTwits vs. Reddit in the Current Stack
- **Acquisition path**
  - *Reddit*: multi-stage flow (queue import ➝ worker ➝ sentiment model) that lands both raw mentions (`reddit_mentions`, `reddit_posts_std`, `reddit_sentiment`) and structured aggregates (`v_reddit_daily_signals`).
  - *StockTwits*: single edge function (`stocktwits-data`) executed on demand; messages get cached intact in `sentiment_history.metadata` without separate scoring tables.
- **Normalization**
  - Reddit already exposes polarity/confidence via `reddit_sentiment` and daily rollups; downstream components can consume ready-made scores.
  - StockTwits currently surfaces only “data present” flags; every consumer must inspect the JSON blob to understand sentiment.
- **Fusion point**
  - Components like `SentimentNormalizer` and `SentimentDataProcessor` expect per-source sentiment stats. Reddit fulfills that contract; StockTwits contributes coverage but no weighted sentiment yet.
  - The plan is to persist numeric StockTwits sentiment metrics so both feeds plug into the same normalization path, then build hourly join views for overlap/lead–lag analysis or blended trading signals.

## 3. Key Questions to Answer
1. [x] **Coverage**: Which tickers appear on StockTwits that we miss on Reddit (and vice versa)? How often does StockTwits fill Reddit gaps within the same time window?
2. [x] **Timeliness**: Does StockTwits provide earlier sentiment shifts (lead/lag) compared to Reddit mentions?
3. [ ] **Quality** *(in progress)*: Are StockTwits sentiment scores/noise ratios comparable to Reddit? Do messages correlate with subsequent price action or our internal trading signals?
4. [ ] **Incremental Value**: When StockTwits data is added to our sentiment stack, do downstream models, alerts, or trading strategies perform measurably better vs. Reddit-only baselines?
5. [ ] **Operational Cost**: What is the latency + infra cost of covering the ticker universe under current rate limits? What is the engineering cost to maintain/refactor the scraper?

> **Status recap:** Coverage and Timeliness are fully answered via the overlap/lead-lag analyses above. Quality and Incremental Value remain open while we finish the calibration follow-ups and blended backtests (lighter TA sweep pending). Operational Cost has not started; instrumentation from Phase 0 of the evaluation plan is still outstanding.

## 4. Metrics & Signals
| Dimension | Concrete Metric | Data Source(s) | Status/Notes |
|-----------|-----------------|----------------|--------------|
| Coverage | % of tracked tickers with StockTwits posts in past N hours; overlap ratio with Reddit mentions | `sentiment_history`, `reddit_mentions`, `stocktwits` metadata | ✅ Sep 18–26: 23–56 shared tickers/day; StockTwits added 37–66 tickers/day, Reddit added 0–18 |
| Freshness | Median minutes between StockTwits vs Reddit first mention per ticker/event | timestamps in `sentiment_history`, `reddit_mentions` | ✅ Sep 18–26 lead/lag: median +48 min (Reddit earlier), StockTwits led 43% of overlaps |
| Volume | Messages per ticker/day; unique users per ticker | StockTwits metadata (message body, user info) | ✅ Sep 18–26: avg 68 msgs/ticker-day; median 29; follower median 36K (p90 ≈ 487K) |
| Sentiment Quality | Bullish/Bearish counts vs Reddit positive/negative; sentiment polarity consistency | Derived sentiment scoring (needs implementation) | ▶️ Calibration sample (2025-09-13..27): 551 ticker-days, ST bullish vs Reddit non-pos 76%, both neutral 16%, ST bearish vs Reddit non-neg 8%; corr(st_weighted, Reddit avg) ≈ 0.01, corr(st_simple, Reddit avg) ≈ 0.07; ST weighted mean ≈ +0.30 vs Reddit mean ≈ +0.04 |
| Predictive Power | Change in win-rate/Sharpe when StockTwits sentiment is included vs excluded | Backtests (`backtest_sweep_results`), new ablation runs | ✅ 2025-09-11..27: Reddit-only (w=1/0) → 32 trades, avg +1.26%, Sharpe 0.36; blended (w=0.7/0.3, min_mentions=3, pos_rate_min=0.20) → 130 trades, avg +1.50%, Sharpe 0.41. With production guards (min_trades≥10, min_sharpe≥0) pocket still delivers 127 trades, avg +1.57%, Sharpe 0.43 |
| Pipeline Reliability | Fetch success rate, average runtime, rate-limit hit rate | Edge function logs (Supabase), new metrics instrumentation | ❌ Logging gaps; need instrumentation |
| Cost | API call counts, compute time, Supabase function invocations | Supabase metrics dashboard | ⏳ Pull from Supabase metrics once reliability instrumentation exists |

### Recent Findings (Sep 18–26 2025)
- **Coverage:** StockTwits delivered broad reach—37–66 tickers/day that Reddit missed—while Reddit added 0–18 unique tickers. Overlap sat between 23 and 56 tickers/day through Sep 24, then tightened to 23–31 once Reddit coverage rebounded on Sep 25–26.
- **Timeliness:** Across 305 shared ticker-days the median lag was +48 minutes (Reddit earlier); interquartile range spanned –279 to +830 minutes. StockTwits led 131 overlaps (43%), reinforcing that it surfaces meaningful early sentiment even though Reddit still fires first slightly more often.
- **Volume:** Across 2025-09-18..26 we observed an average 68 messages per ticker-day (median 29); 197 ticker-days hit the 150 message cap, and median follower reach per ticker-day was ~36K (p90 ≈ 487K), underscoring meaningful author influence.
- **Sentiment alignment:** Expanded calibration (2025-09-13..27, 551 ticker-days) shows StockTwits bullish labels overwhelming Reddit polarity (76% of overlaps are ST Bullish / Reddit ≤0; neutral consensus 16%; ST Bearish / Reddit ≥0 in 8%). Follower-weighted vs Reddit average score correlation ≈0.01 (simple ≈0.07). Neutral-heavy Reddit distribution reinforces the need for NLP fallbacks + longer horizon before trusting cross-platform sentiment.
- **Backtest pulse:** Blended sweep (2025-09-11..27) shows meaningful lift: Reddit-only (w=1/0) produced 32 trades (avg +1.26%, Sharpe 0.36) while w=0.7/0.3 delivered 130 trades (avg +1.50%, Sharpe 0.41). Enforcing production guards (min_trades≥10, min_sharpe≥0) still yields 127 trades with avg +1.57% and Sharpe ≈0.43. StockTwits-heavy mixes (0.3/0.7 and 0/1) remain close, suggesting the optimal ratio may lie between 30–70% Reddit weighting pending larger samples; the scorecard below captures the highest-Sharpe pockets with ≥20 trades.
- **TA gating sweep:** `reddit-utils/sweep_blended.sh` now iterates stock/volume screens (volume z-score, volume ratio/share, RSI caps) alongside sentiment weights so we can spot whether high-liquidity or momentum regimes change blended-signal quality. Summary CSVs now record the gating knobs per run for quicker inspection.
- **Softened TA sweep (Sep 28 run):** Relaxed guards (`vr12`, `vr12_vs020`, `vr14_vs024`, `vs018`, `vz04`) finished 1,260 runs. Results echo the baseline: `vs03` and the lighter `vs018` (share ≥0.18) keep Sharpe ≈0.42 with ≥130 trades, while ratio/z-score gates (`vr12*`, `vr14_vs024`, `vz04`) collapse to ≤24 trades and near-zero Sharpe. Heavy TA filters should remain sidelined unless we find larger-sample windows where they recover volume.
- **Scorecard (≥20 trades):**
  | Weight mix | Gate | Config (min_mentions / pos_rate / pos_thresh) | Trades | Avg ret % | Sharpe | Tag |
  |------------|------|-----------------------------------------------|--------|----------|--------|-----|
  | 1.0 / 0.0  | vs03 | 1 / 0.20 / 0.03                               | 28     | 1.42     | 0.39   | `vs03_mm1_pr0p20_pt0p03_wr1p0_ws0p0` |
  | 0.7 / 0.3  | vs03 | 3 / 0.20 / 0.03                               | 116    | 1.53     | 0.41   | `vs03_mm3_pr0p20_pt0p03_wr0p7_ws0p3` |
  | 0.5 / 0.5  | vs03 | 3 / 0.20 / 0.03                               | 126    | 1.50     | 0.42   | `vs03_mm3_pr0p20_pt0p03_wr0p5_ws0p5` |
  | 0.3 / 0.7  | vs03 | 3 / 0.20 / 0.03                               | 130    | 1.48     | 0.42   | `vs03_mm3_pr0p20_pt0p03_wr0p3_ws0p7` |
  | 0.0 / 1.0  | vs03 | 3 / 0.20 / 0.03                               | 132    | 1.47     | 0.42   | `vs03_mm3_pr0p20_pt0p03_wr0p0_ws1p0` |
  | best vs03  | vs03 | 3 / 0.20 / 0.03                               | 130    | 1.48     | **0.42** | `vs03_mm3_pr0p20_pt0p03_wr0p3_ws0p7` (weights 0.3 / 0.7) |
  | best base  | base | 3 / 0.20 / 0.03                               | 144    | 1.46     | **0.42** | `base_mm3_pr0p20_pt0p03_wr0p3_ws0p7` (weights 0.3 / 0.7) |
- **Scorecard sanity check (9/08–9/30):** Mini-sweep on the same pockets confirms stability at longer window: `base_mm3_wr0p3_ws0p7` → 188 trades, avg 1.41 %, Sharpe 0.430; `vs03_mm3_wr0p3_ws0p7` → 174 trades, avg 1.42 %, Sharpe 0.431; `vs03_mm3_wr0p0_ws1p0` → 176 trades, avg 1.41 %, Sharpe 0.430; `vs018_mm3_wr0p3_ws0p7` → 181 trades, avg 1.41 %, Sharpe 0.430. Reddit-only `vs03_mm1_wr1p0_ws0p0` prints 37 trades (avg 1.02 %, Sharpe 0.31).
- **Sentiment mode comparison (9/08–9/30 sweep rerun):** Using the patched `run_scorecard_sweep.sh`, STAT mode (`stocktwits_stat_score`) now shows healthy lift once StockTwits weight >0 (`vs03_mm3_wr0p3_ws0p7` = 174 trades, avg 1.42 %, Sharpe 0.431 vs Reddit-only 37 trades, Sharpe 0.31). SIMPLE mode (raw bullish/bearish) mirrors STAT because only a handful of days have conflicting labels—blended configs collapse to 3–6 trades, all driven by SOFI. WEIGHTED mode (follower-weighted scores) is even sparser (≤6 trades) and dominated by the same SOFI pocket. Conclusion: we need more labeled data before trusting SIMPLE/WEIGHTED; STAT remains the only mode with volume today. (CSVs: `results/scorecard_runs/summary_20250929_150343_STAT.csv`, `_171953_SIMPLE.csv`, `_150426_WEIGHTED.csv`).
- **Backtest hook:** `sweep_with_rules.sql` now accepts `ST_SENTIMENT_MODE` (`STAT` default, `SIMPLE`, or `WEIGHTED`) and carries `stocktwits_simple_score`, `stocktwits_weighted_score`, `stocktwits_follower_sum` through `tmp_signals_all`, enabling side-by-side runs once the overlap view exposes the new columns.

## 5. Data & Instrumentation Needs
### Temporary Backfill Script
- [x] Document `scripts/stocktwits-backfill.ts` usage, tunables, and throttling behaviour.
- [x] Automate verification via `v_stocktwits_daily_signals` / `v_sentiment_daily_overlap` after each run.

### Universe Tuning
- [ ] Audit low-traffic tickers (e.g., A, ATER, BANC, BBIG, BILI) once the 2025-09-25/26 backfill lands; demote or replace laggards.
- [ ] Monitor per-symbol message totals during nightly sweeps and reallocate quota toward higher-velocity symbols.

### Integration Roadmap
- [ ] Persist StockTwits bullish/bearish labels, inferred polarity scores, and author metadata so sentiment can be normalized alongside Reddit.
- [ ] Build an hourly aggregation that joins Reddit + StockTwits sentiment/volume per symbol for lead/lag analysis.
- [x] Extend the daily overlap view (`v_sentiment_daily_overlap`) with StockTwits volume + sentiment columns (live via 2025-09-26 migration).
- [ ] Add run-level observability (coverage counts, retries, latency) to the StockTwits fetch path.
- [ ] Evaluate migrating the StockTwits fetcher into `SentimentBatchProcessor` primitives for consistency with Reddit ingestion.

### Sentiment Quality Prep
- [x] Define StockTwits sentiment scoring rubric (bullish/bearish labels with NLP fallback for neutral messages).
  - Use `entities.sentiment.basic` > `sentiment.basic` when present; treat `Bullish` as +1, `Bearish` as –1.
  - For unlabeled posts, run a lightweight classifier (OpenAI `text-embedding-3-large` + logistic head or keyword heuristic) to assign {-1, 0, +1}.
  - Keep follower weighting capped at 10K (existing backfill logic) to average out whale influence.
- Calibration snapshot: 956 ticker-days; mean Reddit mentions 16, median 3. 68% of joined days have ≥1 positive/negative Reddit mention, 32% remain neutral-only.
- [x] Stage a sample set of StockTwits messages vs Reddit sentiment labels for calibration (`analysis/stocktwits_reddit_calibration.csv`, 9/18–9/26; all StockTwits messages per ticker-day with Reddit sentiment aggregates).
  - Follower-weighted vs Reddit average score correlation ≈0.11 (simple avg ≈0.17) across 200 ticker-days. StockTwits bullish days overlap Reddit bullish ≈44%; Reddit bullish days align with StockTwits bullish ≈98%.
- [x] Prototype follower-weighted sentiment aggregation and compare variance vs. Reddit baselines.
  - `analysis/stocktwits_weighted_daily.sql` builds a per-day/ticker aggregate (simple + weighted averages, follower sums) for arbitrary windows.
  - `analysis/stocktwits_follower_weighted_summary.py` (calibration export) → ticker-days = 322, simple vs Reddit corr ≈ 0.107, follower-weighted vs Reddit corr ≈ 0.009, avg follower sum ≈ 11.6 K, ≈3 StockTwits msgs/ticker-day.
- [ ] Identify backtest hooks to ingest provisional StockTwits sentiment scores for offline evaluation.
  - Plan: extend `v_sentiment_daily_overlap` with `stocktwits_simple_score`/`stocktwits_weighted_score`, surface through `sweep_with_rules.sql`, then re-run blended pockets.
- [ ] Run correlation checks (notebook tasks): cross-label agreement, follower-weighted sentiment vs Reddit averages, add next-day price-change join.
  - Price correlation now possible (enhanced_market_data/prices_daily updated through 2025-09-26). First pass: corr(ST weighted, next-day returns) ≈ -0.12; corr(Reddit avg, next-day returns) ≈ 0.00 across 40 ticker-days. Need more history before drawing conclusions.
  - Lead/lag snapshot (2025-09-18..26): 289 ticker-days; StockTwits leads on 120 (median lead ≈ -270 min), Reddit leads on 169 (median lead ≈ +56 min), no simultaneous cases.
  - Next: once weighted scores thread through the backtest pipeline, rerun correlations for 9/08–9/30 using `results/scorecard_runs/summary_20250929_101341.csv` and extend the notebook.

### Backtest Follow-ups
- [x] Run the softened TA sweep (`vr12_vs020`, `vr14_vs024`, `vz04`, `vr12`, `vs018`) and compare results against the proven `base` / `vs03` scorecard pockets. *(Completed 2025-09-28; vs03 + vs018 remain viable, ratio/z-score filters underperform.)*
- [x] Evaluate whether to include `vs018` (volume_share ≥0.18) as a production option alongside `vs03`, or keep `base`/`vs03` as the default pair after testing another historical window. *(9/08–9/30 mini-sweep shows `vs018` tracks `vs03` almost exactly; keep as optional guardrail.)*
- [ ] Decide whether to retire or reposition the heavy TA gates (`vr15*`, `vr20_vs025`, `vr15_rl60_rs35`, `vz10_rl65`) that yield <20 trades despite high Sharpe outliers.
- [ ] Package the blended scorecard findings into a Lovable-facing summary once the lighter sweep lands (emphasize StockTwits-heavy pockets and trade counts).

### Status Log
- [x] StockTwits backlog caught up through 2025-09-24; catch-up job running for 2025-09-25/26.
- [x] Daily StockTwits import stable—246 new records processed on 2025-09-27 with latest timestamp 15:04 UTC.
- [x] Schedule follow-up Reddit 7-day backfill to align baselines before incremental-value tests. (Completed; coverage counts for 2025-09-18..26 now at 33–56 tickers/day per `reddit_mentions`.)
- [ ] Analyze combined overlap + lead/lag once 2025-09-26 data is fully validated post-backfill.

## 6. Evaluation Plan
**Phase 0 – Instrumentation (1 week)**
- Add metrics logging to `stocktwits-data` (duration, symbols requested/fetched, rate-limit incidents).
- Create hourly aggregation job/view combining Reddit + StockTwits signals (counts, average sentiment, latest timestamp).
- Normalize StockTwits sentiment (bullish/bearish → [-1,1]) before persisting.
- While paginating, persist a lightweight `messages_seen` counter so we capture total StockTwits volume even when we cap stored messages at 200.

*(Status: not started—these tasks remain open and block the Operational Cost question. Next step: ticket each bullet so Phase 3 cost analysis can begin.)*

*(Status: not started—these tasks remain open and block the Operational Cost question.)*

**Phase 1 – Descriptive Analysis (1-2 weeks)** *(partially underway)*
- Compute coverage overlap matrices (ticker × day) for StockTwits vs Reddit.
- Analyze lead/lag: for spikes in Reddit sentiment, measure if StockTwits leads/lags by >30 minutes.
- Evaluate noise ratio: distribution of sentiment scores, variance, user follower-weighted signals.

*(Status: coverage + lead/lag complete; noise-ratio analysis still pending alongside hourly aggregation from Phase 0.)*

**Phase 2 – Incremental Value Tests (2 weeks)** *(blocked on larger sample)*
- Run backtests or historical simulations with and without StockTwits-derived features (bullish ratio, sentiment velocity) using identical parameters.
- Perform feature ablation in the sentiment aggregator: measure changes in `qualityScore`, alert counts, trading signal precision/recall.
- Investigate case studies where StockTwits uniquely surfaced symbols; quantify realized PnL or avoided losses.

*(Status: initial blended sweep complete; awaiting softened TA sweep + production hooks to close this phase.)*

**Phase 3 – Operational Review (parallel with Phase 2)**
- Stress-test ingestion by batching >15 symbols via the batch processor; measure latency improvements.
- Estimate resource cost (Supabase invocations, compute time) scaling to full symbol universe.
- Propose refactor plan (split fetch/persist logic, reuse batch utilities, add sentiment scoring module).

*(Status: not started—scheduled after instrumentation/backtest follow-ups. TODO: break into individual tasks once Phase 0 completes.)*

**Phase 4 – Recommendation & Rollout (1 week)**
- Synthesize findings into keep/scale/deprecate recommendation.
- If value is demonstrated, define roadmap items (e.g., integrate with batch processor, add boosted sentiment weighting, alerting thresholds).
- If marginal, outline cost-saving options (reduced symbol set, lower frequency, fallback-on-demand).

*(Status: not started—will run once Phases 0–3 close.)*

## 7. Decision Criteria
- **Adopt** if StockTwits materially increases coverage or improves trading/backtest metrics by agreed thresholds (e.g., ≥5% win-rate lift or significant early warning capability) with manageable latency (<2× Reddit-only) and engineering cost.
- **Maintain as optional** if value is neutral but coverage is complementary without major cost.
- **Deprecate** if incremental benefit is negligible or operational overhead outweighs gains.

## 8. Risks & Mitigations
- **API instability / rate limits**: Use batch processor’s staggered scheduling, store progressive checkpoints, and explore paid API options.
- **Sentiment spam/noise**: Implement user-level weighting (followers, message frequency) and cross-validate against Reddit signals.
- **Engineering drag**: Modularize the edge function, add testing harnesses, and reuse shared utilities to keep maintenance lean.
- **Data bias**: Ensure comparative analysis accounts for time-of-day effects and symbol popularity differences between platforms.

## 9. Suggested Deliverables
- Dashboard / notebook summarizing coverage, freshness, and sentiment correlation.
- Backtest report demonstrating impact of StockTwits features.
- Refactored ingestion plan integrating `SentimentBatchProcessor`.
- Final recommendation memo (go/no-go + roadmap).

### Pending Analysis Before Final Recommendation
- Extend blended Reddit + StockTwits dataset beyond 2025-09-26 once nightly backfills finish; rerun calibration/correlation on the wider window.
- Prototype follower-weighted StockTwits normalization (bullish/bearish to [-1,1]) and plug into the shared aggregator for side-by-side metrics.
- Run blended grid backtests (e.g., W_REDDIT≈0.6, W_STOCKTWITS≈0.4) across multi-week spans to gauge incremental uplift vs. Reddit-only baselines.

---
**Next Action**: wrap remaining Phase 0 instrumentation tasks and launch the extended descriptive analysis (wider window + normalization prototype).
