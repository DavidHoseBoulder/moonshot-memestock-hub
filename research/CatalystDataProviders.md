# Catalyst Data Provider Scan

Quick scan of earnings, analyst, and corporate event data feeds we can evaluate for the Event-Driven Catalyst Layer. Focus is on API accessibility, breadth of catalyst types, and suitability for daily ETL/backtesting.

## Evaluation Criteria
- **Coverage** — Earnings dates, surprise metrics, guidance updates, analyst rating changes, conference/calendar events.
- **Latency & Frequency** — How quickly updates appear after announcement; intraday refresh cadence.
- **Historical Depth** — Backfill length to support 12–18 month tests + longer baselines.
- **Delivery & Format** — REST/GraphQL APIs, webhooks, flat files, normalization requirements.
- **Cost & Licensing** — Pricing tier, redistribution constraints, paper/live trading allowances.
- **Reliability** — SLA, redundancy, data quality track record.
- **Integration Lift** — Auth flow, rate limits, SDKs, and how easily we can blend with existing Polygon market data.

## Candidate Providers

| Provider | Catalyst Types | Delivery | Historical Depth | Notes |
|----------|----------------|----------|------------------|-------|
| **Polygon.io** | Earnings calendar, actual vs. estimate, guidance, analyst ratings (beta), SEC filings | REST API, WebSockets | ~20+ years earnings history | Already in stack for prices; volume discounts; analyst ratings less mature, but earnings endpoints stable. |
| **Finnhub** | Earnings, guidance, economic events, analyst upgrades/downgrades, price targets | REST + WebSocket | 10+ years | Free tier limited; paid plans include broader coverage. Rate limits manageable; data includes sentiment scores. |
| **Intrinio** | Earnings events, analyst ratings, guidance, investor day/conference data (select feeds) | REST | Varies by feed (5–20 years) | Catalog of separate feeds; licensing varies. Check "US Fundamentals" + "Analyst Ratings" bundles. |
| **Wall Street Horizon** | Corporate events (earnings, conferences, investor days, splits), guidance revisions | REST, file drops, webhooks | 10+ years | Strong on non-earnings events; premium pricing but high-quality schedule data. |
| **Benzinga** | Real-time corporate news, earnings, analyst actions, calendar | REST, WebSocket | 5+ years | Real-time focus; can complement for intraday alerts. Pricing mid-to-high; includes textual headlines. |
| **Zacks** | Earnings surprises, analyst ratings, revisions | REST (via partners), file exports | 10+ years | Traditional fundamentals provider; check redistribution rights. |
| **Refinitiv** | Earnings, corporate actions, analyst estimates/revisions | APIs (DataScope, Elektron) | 20+ years | Enterprise-grade, expensive; consider only if we need comprehensive coverage and can justify cost. |
| **FactSet** | Earnings, guidance, transcripts, analyst revisions | REST/ODBC/File | 20+ years | Similar to Refinitiv—broadest coverage but high integration lift and licensing. |
| **Nasdaq Data Link** | Earnings calendar, analyst estimates (via partners) | REST | 10+ years | Aggregates third-party datasets; need to vet update latency per dataset. |

## Initial Shortlist (API-first, mid-market pricing)

### Pricing Snapshot (Preliminary)

### Integration Draft (Polygon.io Ingestion)
- **Raw capture** — Reuse the existing Supabase storage bucket (`polygon-market-data/raw`) to drop the `/vX/reference/earnings` and `/vX/reference/financials` payloads keyed by `symbol/trade_date.json` for traceability.
- **Staging table** — Create `stg_polygon_catalyst_events` in Postgres mirroring the API schema (symbol, event_type, fiscal_period, report_date, announce_time, eps_actual, eps_estimate, surprise_pct, guidance_low/high, updated_at). Load via Supabase edge function or ingestion worker.
- **Feature store join** — Derive a slim table `catalyst_events` with one row per `(symbol, catalyst_date)` and flags for `is_earnings`, `has_guidance`, `surprise_bucket`, `announce_window`. This becomes the source for the feature store extension referenced in `NextVectors.md`.
- **News stream** — Stand up a sibling table `news_headlines` keyed by `(symbol, published_at, headline_id)` with Polygon `/news` payloads (title, summary, article_url, source, tickers). Only promote deterministic events (e.g., confirmed earnings reschedules) into `catalyst_events`; retain raw headlines for contextual analytics.
- **Views for backtests** — Materialize `v_symbol_catalyst_window` to expose `symbol`, `trade_date`, and rolling indicators (e.g., `within_pre_window_3d`, `within_post_window_3d`). Backtests can left join on `(symbol, trade_date)` without repeated window math.
- **Retention** — Since Polygon free tier only grants ~2 years of history, schedule a nightly job to persist new events so we accumulate our own long-tail history from June 2025 onward. Consider periodic exports to cold storage to guard against accidental deletions.
- **Loader strategy** — Keep existing bar importers focused on price data; add a sibling ingestion path (Supabase edge function or worker) dedicated to catalysts/news so rate limits and retries don’t interfere with real-time bars.


| Provider | Free Tier | Indicative Paid Plans | Notes |
|----------|-----------|-----------------------|-------|
| **Polygon.io** | Free tier (key required) allows 5 calls/min & 100 calls/day; includes reference endpoints but earnings calendar and financials are capped to recent data. No SLA. | Starter ~$249/mo unlocks higher rate limits (120 calls/min), full earnings history, corporate actions; custom enterprise pricing for >5M calls/month. | Already under contract for market data; extending to catalyst feeds may only need plan upgrade. Confirm if current subscription already covers `/reference/earnings`. |
| **Finnhub** | Free for personal/non-commercial use; 60 calls/min but limited dataset (earnings calendar, economic events). Redistribution/commercial use forbidden. | Startup $99/mo (reduced limits), Standard $399/mo with commercial rights, higher rate limits, historical analyst data; Enterprise custom. | Need commercial license for Lovable + trading. Verify whether analyst rating history requires add-on. |
| **Wall Street Horizon** | No free tier; sample files available on request. | Pricing by dataset; API packages reported in the low-to-mid four figures annually for earnings + events bundles; add-ons (conferences, guidance) increase cost. | Strong dataset but higher lift; confirm minimum contract length and redistribution terms. |

> Pricing changes frequently; confirm details with vendors before committing.

### Shortlist Candidates
1. **Polygon.io** — Already a vendor; extend usage to `/vX/reference/financials` and `/vX/reference/earnings`. Need to confirm analyst event reliability.
2. **Finnhub** — Broad catalyst coverage with reasonable API ergonomics. Evaluate paid plan for rate limit alignment.
3. **Wall Street Horizon** (light plan) — For conference/investor-day coverage we can’t get elsewhere. Validate API pricing for single-team usage.

## Open Questions
- Required catalyst breadth: do we need conference & investor-day coverage day one, or just earnings + analyst changes?
- Acceptable latency: would end-of-day files work, or do we need intraday updates for pre/post-market entries?
- Licensing constraints: will redistribution into Lovable/paper trading require additional agreements?
- Budget envelope: cap for Phase 1 experiments?

## Next Steps
- [ ] Schedule vendor discovery calls (Polygon, Finnhub, Wall Street Horizon) to confirm coverage, latency, and pricing.
- [ ] Pull sample responses for earnings + analyst events, map into feature store schema.
- [ ] Compare historical depth vs. backtesting window; note gaps needing alternate sources.
- [ ] Draft ingestion spike plan (auth, rate limits, retries) for top candidate.
- [ ] Document licensing/legal considerations for redistributing event data in Lovable and automation.
- [ ] HVV data hygiene follow-ups:
  - [ ] Once validated, update `enhanced_market_data` in place with forward-filled volatility (`jsonb_set`) and retire the temporary view.
  - [ ] Port the warm-up/forward-fill logic into Polygon/Yahoo ingest functions so zero-vol rows stop appearing in fresh loads.
  - [ ] Add ticker-alias handling for symbols that rebrand (e.g., `PARA` → `PSKY`) so backfills pull continuous history.

Maintain this sheet as we gather quotes or sample payloads.

### News vs. Social Mentions
- Polygon and Finnhub both offer news endpoints, but only Benzinga specializes in real-time headline streams within this shortlist.
- Reddit/StockTwits sentiment often reacts to news, yet latency varies; major earnings headlines propagate quickly, while niche guidance updates or SEC filings may not trend socially.
- Treat social mentions as a complementary signal: use headline feeds (if licensed) for deterministic catalyst flags, then measure whether social chatter amplifies or filters the same events.
- If we skip dedicated news ingestion initially, instrument how often sentiment spikes occur without a matching Polygon catalyst entry to estimate missed headline coverage.
