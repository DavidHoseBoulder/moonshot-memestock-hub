# Next Vectors Backlog

This backlog captures expansion ideas we want to explore while the paper-trade cohort gathers live data. Items are ordered by current priority. Each card includes a thesis, required lift, and a lightweight go/no-go gate so we can prune aggressively.

## Execution Task Stack

Shortlist of workstreams we want to actively pull this cycle. Each task is traceable to the deeper docs linked in parentheses.

- **Screener foundation** — Prototype high-volatility equity screen in ETL, backfill 12–18 months, and wire watchlist metadata joins (`High-Volume Volatility Screen`).
- **Catalyst tagging** — Research earnings/analyst data providers, select source, then extend feature store with event flags and rerun segmented backtests to confirm uplift ≥30 bps (`Event-Driven Catalyst Layer`, `research/CatalystDataProviders.md`).
- **Rule hygiene** — Lock "extra strong" promotion criteria, then run targeted grid backtests for symbols lacking shards (HOOD, GOOGL, SOFI + latest cohort) and schedule nightly sweeps once diagnostics exist (`RecommendingTrades.md`).
- **Options data spike** — Source delayed options flow (or public sweep feed fallback), ingest, build sentiment/flow concordance score, and measure hit-rate lift (`Options Flow Confirmation`).
- **Watchlist hygiene ops** — Dedupe ticker metadata, lock liquidity buckets, and instrument nightly Polygon + sentiment cron monitoring (ongoing hygiene backlog).
- **Short-squeeze enrichment** — Pull short-interest and borrow metrics, enrich universe metadata, and backtest squeeze flag combos (`Short-Interest Squeeze Monitor`).
- **StockTwits phase-up** — Close Phase 0 instrumentation tasks (noise-ratio analysis, cost instrumentation) before blended Reddit+StockTwits backtests and operational cost review (`AssessStocktwits.md`).
- **Crypto pilot** — Park for now; when activated, normalize BTC/ETH market data, validate continuous-hours handling, and draft `CryptoVectors.md` once ingestion checks out (`Crypto Large-Cap Extension`).
- **Micro-cap probe** — Stand up low-ADV sweep with execution guardrails (max order slices, halt triggers), compare hygiene metrics via `grid_hygiene_summary.py`, and decide go/no-go on micro-cap track (`Mid/Late Cycle Micro-Cap Sentiment Probe`).

## 1. High-Volume Volatility Screen (Equities)
- **Thesis:** Target liquid names with elevated realized & implied volatility percentiles to harvest outsized swings when social sentiment spikes.
- **Lift:** Build a daily screener (`ADV > $200M`, price > $10, IV/20d RV percentile > 70). Add metadata to the symbol universe so StockTwits/Reddit joins stay cheap.
- **Next Step:** HVV view is live and wired into `backtest_grid` (defaults `USE_HVV=1`). Monitor nightly sweeps for uplift and keep the baseline toggle handy (`USE_HVV=0`) for regression checks.
- **Gate:** Out-of-sample Sharpe ≥ 1.0 relative to baseline universe, drawdown < 1.5× control (met on the 2025-07-16→2025-10-12 nightly window; continue tracking).

## 2. Event-Driven Catalyst Layer
- **Thesis:** Layer earnings/analyst-events calendar context onto social signals to time entries around known volatility pockets.
- **Lift:** Ingest earnings dates, conference mentions, notable downgrades/upgrades. Tag trades that occur ±3 days from catalysts.
- **Next Step:** Extend feature store to include catalyst proximity flag; rerun backtests segmented by catalyst windows.
- **Gate:** Positive expectancy uplift of ≥30 bps per trade vs. non-catalyst cohort.

## 3. Options Flow Confirmation
- **Thesis:** Use unusual options activity (sweep size, premium concentration) as a secondary confirmation before upgrading a “Weak” sentiment signal.
- **Lift:** Source delayed option flow (free or inexpensive vendor) and map to tickers with 10-minute latency tolerance.
- **Next Step:** Build a simple concordance score (0–1) comparing sentiment direction vs. dominant sweep direction.
- **Gate:** Lift in hit rate ≥5% with unchanged average hold time.

## 4. Crypto Large-Cap Extension (BTC, ETH)
- **Thesis:** Capture 24/7 sentiment flow where social chatter leads price discovery more directly than equities.
- **Lift:** Normalize exchange data to daily bars (4 pm ET close proxy), add fee/slippage assumptions, confirm backtester handles continuous trading hours.
- **Next Step:** Spin out a dedicated `CryptoVectors.md` once ingestion + cleaning proofs pass; run a short walk-forward.
- **Gate:** Sharpe ≥ 0.8 with max drawdown < 12% in the first live month of paper trading.

## 5. Short-Interest Squeeze Monitor
- **Thesis:** Combine elevated short-interest and borrow-cost data with sentiment spikes to flag asymmetric squeeze setups.
- **Lift:** Pull weekly short-interest, borrow rates, float data; enrich watchlist metadata.
- **Next Step:** Backtest flags that align high short-interest percentile (>85th) with sentiment inflections.
- **Gate:** Win rate ≥ 55% with R/R ≥ 1.8 on paper trades.

## 6. Mid/Late Cycle Micro-Cap Sentiment Probe
- **Thesis:** Relax liquidity gates (ADV $100–500M) to capture sharper sentiment-led moves in thinly traded names, using tighter risk controls instead of excluding them outright.
- **Lift:** Spin up a parallel sweep configuration with lower ADV thresholds and a curated symbol list (e.g., top Reddit/Twitter chatter under $5B market cap). Mirror hygiene metrics so we can compare Sharpe vs. liquidity directly.
- **Next Step:** Run an exploratory backtest (shorter window) and feed output through `grid_hygiene_summary.py` to benchmark Sharpe/volatility against the core cohort. Evaluate whether the extra edge offsets execution risk.
- **Gate:** Demonstrated Sharpe ≥ 0.4 with ADV-adjusted position sizing (e.g., deploy ≤10% of daily dollar volume) and sentiment coverage health ≥ 0.9; if churn is high or fills look unreliable, scrap.

---

### Watchlist Hygiene & Foundations (Ongoing)
- Dedupe, normalize ticker metadata, and tag liquidity buckets.
- Automate ingestion quality checks so only symbols meeting coverage thresholds graduate to live paper trades.
- Document outcomes per experiment to feed back into the prioritization loop.
- Parked TODOs: (a) add job-run monitoring/alerting for nightly Polygon + sentiment crons; (b) revisit borrow-cost/short-interest data plan if we decide to trade borrow-sensitive strategies.
