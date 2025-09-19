# Recommending Trades

This note explains how a daily Reddit signal becomes a promoted rule, how those rules are filtered, and how everything surfaces inside the Lovable UI.

```mermaid
flowchart TD
  subgraph Ingestion
    A[reddit_pipeline.sh<br/>mentions + sentiment]
    B[v_reddit_daily_signals]
  end

  subgraph Backtesting & Promotion
    C[backtest_grid.sql<br/>sweeps thresholds]
    D[promote_rules_from_grid.sql<br/>applies hard filters]
  end

  subgraph Rulebook & Heuristics
    E[live_sentiment_entry_rules<br/>enabled rules]
    F[sentiment_grade_config<br/>fallback grading]
  end

  subgraph Consumption
    G[v_entry_candidates<br/>rule-filtered daily signals]
    H[v_triggered_with_backtest<br/>Lovable feed]
    I[Lovable UX cards]
    J[Automation<br/>paper/live trades]
  end

  A --> B --> C --> D --> E --> G --> H --> I
  H --> J
  F -.-> I
```

## 1. Signals → Daily Aggregates
1. `reddit_pipeline.sh` fetches posts/comments, builds mentions, and scores them (GPT model output).  
2. `v_reddit_daily_signals` aggregates per `(trade_date, symbol)`:
   - `n_mentions`, `avg_score`, `used_score` (currently identical).
   - Only mentions that have a row in `reddit_sentiment` contribute; no model filter is applied yet.

This table is the raw sentiment feed. On its own it does not gate signals.

## 2. Backtesting & Rule Discovery
To turn daily averages into rules, we run the **backtesting pipeline** (`BACKTESTING_PIPELINE.md`):

- **Candidate view** (`v_entry_candidates`):
  - Joins the daily signals to the *current* production rulebook (`live_sentiment_entry_rules`).
  - Requires `n_mentions ≥ min_mentions` and `used_score` to clear the rule’s `pos_thresh` (or fall below for shorts).
  - Yields per-day symbol candidates with computed `margin = used_score - pos_thresh` (or mirrored for shorts).

- **Grid backtest** (`backtest_grid.sql`):
  - Sweeps `min_mentions` / `pos_thresh` across horizons & sides.  
  - Persists full diagnostics (train/valid sharpe, win rate, edges) and writes winners into `backtest_sweep_results`.

- **Promotion** (`promote_rules_from_grid.sql`):
  - Reads the sweep winners and applies *hard filters* (min trades, win rate, sharpe, robustness).  
  - Upserts the survivors into `live_sentiment_entry_rules` with full metadata (start/end window, stats, notes).  
  - `is_enabled` defaults to `true`; disabling a row keeps the metadata but stops live triggers.

> **Why this matters**: the “hard filters” live in SQL so that future runs can diff/track what changed. Promotion is the only supported way to mutate the rulebook at scale.

## 3. Rulebook vs. Heuristics
Two data sets gate trades:

1. **`live_sentiment_entry_rules`** — authoritative trading rules.  
   - Keyed by `(model_version, symbol, horizon, side)`.  
   - Fields: `min_mentions`, `pos_thresh`, `use_weighted`, `min_conf`, plus diagnostics.  
   - Used by pipelines and automation to decide if a symbol can trigger a paper/live trade.  
   - If the rule is missing or `is_enabled = false`, nothing can trigger—even if sentiment looks great.

2. **`sentiment_grade_config`** — UX grading fallback (“strong / moderate / weak”).  
   - Contains generic thresholds (e.g. “Strong if Sharpe ≥ 1.25 & trades ≥ 6”).  
   - Indexed by `(model_version, horizon, side)` plus `*` wildcards.  
   - Used only for presentation in Lovable when a specific rule is missing/disabled.

### Interaction
- When a new daily signal is evaluated, we first ask: *“Is there an enabled rule in `live_sentiment_entry_rules` for this symbol/horizon/side?”*  
  - **Yes** → apply that rule’s thresholds (`min_mentions`, `pos_thresh`, `min_conf`). If the candidate clears them, the pipeline may trigger a trade and the UX shows the rule-specific grade/notes.  
  - **No** → fall back to `sentiment_grade_config` to produce an informational grade. The card can still appear in the UI if the generic thresholds are met, but no automated trade fires.

This split allows analysts to keep seeing symbols (via heuristics) while holding back automated trades until a rule passes backlit testing + promotion.

## 4. How Lovable Uses the Data
Inside Lovable:

1. The UX reads `v_triggered_with_backtest` (which depends on `v_entry_candidates`, the rulebook, and backtest summaries).  
2. If a rule is enabled and the candidate passes its thresholds:
   - The card shows as actionable (Strong/Moderate per rule).  
   - Back-end automation (paper trades, alerts) checks `live_sentiment_entry_rules` to trigger entries.
3. If no rule is enabled:
   - The UX still grades using `sentiment_grade_config` (that’s where the “* wildcards” live).  
   - Cards are informational only; no paper/live trade is created because the automation doesn’t see an enabled rule entry.

## 5. Why Promote from Grid?
- **Repeatability**: the grid backtest + promotion script provides a consistent promotion flow; hard filters are embedded in SQL so we can audit and rerun.  
- **Versioning**: each promotion captures the window/model version used, so `live_sentiment_entry_rules` isn’t just a bag of overrides—it’s a historical record.  
- **Automation readiness**: Lovable and the pipelines only trust rules that have passed through promotion. Direct edits are possible, but discouraged because they skip validation.

## 6. Practical Workflow
1. Run the scoring pipeline (collect mentions + LLM sentiment). ∙  
2. Aggregate signals (`v_reddit_daily_signals`). ∙  
3. Backtest grid across the lookback. ∙  
4. Promote filtered winners → `live_sentiment_entry_rules`. ∙  
5. Seed trades (`seed_paper_trades_rules_only.sh`) to exercise new rules. ∙  
6. Review Lovable cards and paper trades. Disable any rules that misbehave, or iterate promotions.

## 7. FAQ
- **“Why am I only seeing GOOGL?”**  
  Because no other symbol currently has an enabled row in `live_sentiment_entry_rules`. Add more via promotion or manual inserts.

- **“Can’t we just rely on the heuristics table?”**  
  Heuristics (`sentiment_grade_config`) are for UX grading. They do not trigger automation. You still need a real rule to fire trades.

- **“Do we ever use the backup rules?”**  
  `live_sentiment_entry_rules_backup` stores the parameter weights you used when promoting (confidence, recency, sample caps…). It’s reference metadata; nothing in the pipeline reads those rows today. If you want a fallback, you’d need to seed those values back into the live table manually or via a scripted restore.

---

That’s the current end-to-end rationale. If we decide to add default rules or model-specific daily views later, we should update both this doc and the SQL to keep Lovable, backtests, and automation aligned.
