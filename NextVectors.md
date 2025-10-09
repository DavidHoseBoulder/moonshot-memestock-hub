# Next Vectors Backlog

This backlog captures expansion ideas we want to explore while the paper-trade cohort gathers live data. Items are ordered by current priority. Each card includes a thesis, required lift, and a lightweight go/no-go gate so we can prune aggressively.

## 1. High-Volume Volatility Screen (Equities)
- **Thesis:** Target liquid names with elevated realized & implied volatility percentiles to harvest outsized swings when social sentiment spikes.
- **Lift:** Build a daily screener (`ADV > $200M`, price > $10, IV/20d RV percentile > 70). Add metadata to the symbol universe so StockTwits/Reddit joins stay cheap.
- **Next Step:** Prototype the screener in the ETL layer and backfill 12–18 months for sanity checks.
- **Gate:** Out-of-sample Sharpe ≥ 1.0 relative to baseline universe, drawdown < 1.5× control.

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

---

### Watchlist Hygiene & Foundations (Ongoing)
- Dedupe, normalize ticker metadata, and tag liquidity buckets.
- Automate ingestion quality checks so only symbols meeting coverage thresholds graduate to live paper trades.
- Document outcomes per experiment to feed back into the prioritization loop.
- Parked TODOs: (a) add job-run monitoring/alerting for nightly Polygon + sentiment crons; (b) revisit borrow-cost/short-interest data plan if we decide to trade borrow-sensitive strategies.
