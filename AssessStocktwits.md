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
1. **Coverage**: Which tickers appear on StockTwits that we miss on Reddit (and vice versa)? How often does StockTwits fill Reddit gaps within the same time window?
2. **Timeliness**: Does StockTwits provide earlier sentiment shifts (lead/lag) compared to Reddit mentions?
3. **Quality**: Are StockTwits sentiment scores/noise ratios comparable to Reddit? Do messages correlate with subsequent price action or our internal trading signals?
4. **Incremental Value**: When StockTwits data is added to our sentiment stack, do downstream models, alerts, or trading strategies perform measurably better vs. Reddit-only baselines?
5. **Operational Cost**: What is the latency + infra cost of covering the ticker universe under current rate limits? What is the engineering cost to maintain/refactor the scraper?

## 4. Metrics & Signals
| Dimension | Concrete Metric | Data Source(s) |
|-----------|-----------------|----------------|
| Coverage | % of tracked tickers with StockTwits posts in past N hours; overlap ratio with Reddit mentions | `sentiment_history`, `reddit_mentions`, `stocktwits` metadata |
| Freshness | Median minutes between StockTwits vs Reddit first mention per ticker/event | timestamps in `sentiment_history`, `reddit_mentions` |
| Volume | Messages per ticker/day; unique users per ticker | StockTwits metadata (message body, user info) |
| Sentiment Quality | Bullish/Bearish counts vs Reddit positive/negative; sentiment polarity consistency | Derived sentiment scoring (needs implementation) |
| Predictive Power | Change in win-rate/Sharpe when StockTwits sentiment is included vs excluded | Backtests (`backtest_sweep_results`), new ablation runs |
| Pipeline Reliability | Fetch success rate, average runtime, rate-limit hit rate | Edge function logs (Supabase), new metrics instrumentation |
| Cost | API call counts, compute time, Supabase function invocations | Supabase metrics dashboard |

## 5. Data & Instrumentation Needs
### Temporary Backfill Script
### Universe Tuning
- After the backfill completes, audit low-traffic tickers (e.g., A, ATER, BANC, BBIG, BILI) and either demote them to a lower-frequency list or swap in higher-volume/crypto symbols.
- Monitor per-symbol message totals during backfill; downgrade or pause names that consistently deliver minimal traffic and reallocate the quota toward higher-velocity equities or crypto tickers with richer StockTwits coverage.

- One-off backfill lives at `scripts/stocktwits-backfill.ts`; it paginates StockTwits per symbol/day, summarises messages, and inserts daily rows into `sentiment_history`.
- Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; optional tunables: `ST_BACKFILL_DAYS` (default 7), `ST_BACKFILL_PER_DAY` (150), `ST_BACKFILL_MAX_SYMBOLS`, `ST_BACKFILL_SYMBOLS` (comma list override), `ST_BACKFILL_SKIP_SYMBOLS` (exclude already-processed tickers), `ST_BACKFILL_CHUNK_SIZE`, `ST_BACKFILL_CHUNK_DELAY_MS`, `ST_BACKFILL_PAGE_DELAY_MS`, `ST_BACKFILL_SYMBOL_DELAY_MS`, `ST_BACKFILL_FETCH_RETRIES`.
- Run with `npx ts-node --esm scripts/stocktwits-backfill.ts`; the script throttles calls (25-msg pages, 1.2s between symbols) and upserts per-day stats.
- Verify results via `v_stocktwits_daily_signals` / `v_sentiment_daily_overlap` (expect distinct `trade_date` rows per symbol after the run).

- **Sentiment enrichment first**: persist StockTwits bullish/bearish labels, inferred polarity scores, and lightweight author metadata (followers, activity) so we can normalize alongside Reddit.
- **Cross-source alignment**: build an hourly (or finer) aggregation that joins Reddit + StockTwits sentiment/volume per symbol to support lead/lag and overlap analysis.
- **Cross-source alignment**: daily view (`v_sentiment_daily_overlap`) joins Reddit + StockTwits sentiment/volume per symbol so we can inspect coverage matrices, run overlap stats, and compare signals head-to-head. (Extend to intraday later if needed.)
- **Pipeline observability (nice-to-have once the above lands)**: lightweight run-level logging of symbol coverage, API retries, and latency so we can sanity-check rate-limit impacts when we exercise the plan.
- **Optional**: when we revisit operations, consider testing the StockTwits fetch path inside `SentimentBatchProcessor` to reuse staging/queueing primitives already vetted for Reddit.

## 6. Evaluation Plan
**Phase 0 – Instrumentation (1 week)**
- Add metrics logging to `stocktwits-data` (duration, symbols requested/fetched, rate-limit incidents).
- Create hourly aggregation job/view combining Reddit + StockTwits signals (counts, average sentiment, latest timestamp).
- Normalize StockTwits sentiment (bullish/bearish → [-1,1]) before persisting.

**Phase 1 – Descriptive Analysis (1-2 weeks)**
- Compute coverage overlap matrices (ticker × day) for StockTwits vs Reddit.
- Analyze lead/lag: for spikes in Reddit sentiment, measure if StockTwits leads/lags by >30 minutes.
- Evaluate noise ratio: distribution of sentiment scores, variance, user follower-weighted signals.

**Phase 2 – Incremental Value Tests (2 weeks)**
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

---
**Next Action**: implement Phase 0 instrumentation tickets, then schedule the descriptive analysis workflow.

- Schedule a nightly Supabase cron job to rerun the StockTwits window capture once the 9/25 backfill completes.
