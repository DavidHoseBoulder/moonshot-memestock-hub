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
- **Backtest pulse:** Blended sweep (2025-09-11..27) shows meaningful lift: Reddit-only (w=1/0) produced 32 trades (avg +1.26%, Sharpe 0.36) while w=0.7/0.3 delivered 130 trades (avg +1.50%, Sharpe 0.41). Enforcing production guards (min_trades≥10, min_sharpe≥0) still yields 127 trades with avg +1.57% and Sharpe ≈0.43. StockTwits-heavy mixes (0.3/0.7 and 0/1) remain close, suggesting the optimal ratio may lie between 30–70% Reddit weighting pending larger samples.
- **TA gating sweep:** `reddit-utils/sweep_blended.sh` now iterates stock/volume screens (volume z-score, volume ratio/share, RSI caps) alongside sentiment weights so we can spot whether high-liquidity or momentum regimes change blended-signal quality. Summary CSVs now record the gating knobs per run for quicker inspection.

## 5. Data & Instrumentation Needs
### Temporary Backfill Script
- [x] Document `scripts/stocktwits-backfill.ts` usage, tunables, and throttling behaviour.
- [x] Automate verification via `v_stocktwits_daily_signals` / `v_sentiment_daily_overlap` after each run.

### Universe Tuning
- [ ] Audit low-traffic tickers (e.g., A, ATER, BANC, BBIG, BILI) once the 2025-09-25/26 backfill lands; demote or replace laggards.
- [ ] Monitor per-symbol message totals during nightly sweeps and reallocate quota toward higher-velocity symbols.

### Integration Roadmap
- [x] Persist StockTwits bullish/bearish labels, inferred polarity scores, and author metadata so sentiment can be normalized alongside Reddit. *(Edge function/backfill now write follower-weighted stats, net sentiment, volume/engagement and trimmed message metadata per symbol-day.)*
- [x] Build an hourly aggregation that joins Reddit + StockTwits sentiment/volume per symbol for lead/lag analysis. *(`supabase/migrations/20251001090000_add_stocktwits_hourly_overlap.sql` creates `v_sentiment_hourly_overlap`; export helper in `analysis/stocktwits_hourly_overlap.sql`.)*
- [x] Extend the daily overlap view (`v_sentiment_daily_overlap`) with StockTwits volume + sentiment columns. *(View now emits net sentiment, bearish ratio, follower sums, sample size + truncation flag.)*
- [x] Add run-level observability (coverage counts, retries, latency) to the StockTwits fetch path. *(Background batch logging now captures API calls/retries/rate limits and writes summarized metrics to `import_runs`.)*
- [ ] Evaluate migrating the StockTwits fetcher into `SentimentBatchProcessor` primitives for consistency with Reddit ingestion.

### Sentiment Quality Prep
- [x] Define StockTwits sentiment scoring rubric (bullish/bearish labels with NLP fallback for neutral messages).
  - Use `entities.sentiment.basic` > `sentiment.basic` when present; treat `Bullish` as +1, `Bearish` as –1.
  - For unlabeled posts, run a lightweight classifier (OpenAI `text-embedding-3-large` + logistic head or keyword heuristic) to assign {-1, 0, +1}.
  - Keep follower weighting capped at 10K (existing backfill logic) to average out whale influence.
- Calibration snapshot: 956 ticker-days; mean Reddit mentions 16, median 3. 68% of joined days have ≥1 positive/negative Reddit mention, 32% remain neutral-only.
- [x] Stage a sample set of StockTwits messages vs Reddit sentiment labels for calibration (`analysis/stocktwits_reddit_calibration.csv`, 9/18–9/26; all StockTwits messages per ticker-day with Reddit sentiment aggregates).
  - Follower-weighted vs Reddit average score correlation ≈0.11 (simple avg ≈0.17) across 200 ticker-days. StockTwits bullish days overlap Reddit bullish ≈44%; Reddit bullish days align with StockTwits bullish ≈98%.
- [ ] Prototype follower-weighted sentiment aggregation and compare variance vs. Reddit baselines.
- [ ] Identify backtest hooks to ingest provisional StockTwits sentiment scores for offline evaluation.
- [ ] Run correlation checks (notebook tasks): cross-label agreement, follower-weighted sentiment vs Reddit averages, add next-day price-change join.
  - Price correlation now possible (enhanced_market_data/prices_daily updated through 2025-09-26). First pass: corr(ST weighted, next-day returns) ≈ -0.12; corr(Reddit avg, next-day returns) ≈ 0.00 across 40 ticker-days. Need more history before drawing conclusions.
  - Lead/lag snapshot (2025-09-18..26): 289 ticker-days; StockTwits leads on 120 (median lead ≈ -270 min), Reddit leads on 169 (median lead ≈ +56 min), no simultaneous cases.

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

**Phase 1 – Descriptive Analysis (1-2 weeks)** *(partially underway)*
- Compute coverage overlap matrices (ticker × day) for StockTwits vs Reddit.
- Analyze lead/lag: for spikes in Reddit sentiment, measure if StockTwits leads/lags by >30 minutes.
- Evaluate noise ratio: distribution of sentiment scores, variance, user follower-weighted signals.

**Phase 2 – Incremental Value Tests (2 weeks)** *(blocked on larger sample)*
- Run backtests or historical simulations with and without StockTwits-derived features (bullish ratio, sentiment velocity) using identical parameters.
- Perform feature ablation in the sentiment aggregator: measure changes in `qualityScore`, alert counts, trading signal precision/recall.
- Investigate case studies where StockTwits uniquely surfaced symbols; quantify realized PnL or avoided losses.

**Phase 3 – Operational Review (parallel with Phase 2)**
- Stress-test ingestion by batching >15 symbols via the batch processor; measure latency improvements.
- Estimate resource cost (Supabase invocations, compute time) scaling to full symbol universe.
- Propose refactor plan (split fetch/persist logic, reuse batch utilities, add sentiment scoring module).

**Phase 4 – Recommendation & Rollout (1 week)**
- Synthesize findings into keep/scale/deprecate recommendation.
- If value is demonstrated, define roadmap items (e.g., integrate with batch processor, add boosted sentiment weighting, alerting thresholds).
- If marginal, outline cost-saving options (reduced symbol set, lower frequency, fallback-on-demand).

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
**Next Action**: push follower-weighted sentiment prototype through the backtest harness, rerun overlap/correlation notebooks on the expanded (≥1 mo) window, and wire hourly overlap metrics into the trading stack evaluation.
