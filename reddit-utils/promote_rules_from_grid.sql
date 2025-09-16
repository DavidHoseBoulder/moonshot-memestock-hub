\set ON_ERROR_STOP on

-- ========= Tunables (override via -v) =========
\if :{?MODEL_VERSION}      \else \set MODEL_VERSION      'gpt-sent-v1' \endif
\if :{?START_DATE}         \else \set START_DATE         '2025-06-01'  \endif
\if :{?END_DATE}           \else \set END_DATE           '2025-09-12'  \endif
\if :{?MIN_TRADES}         \else \set MIN_TRADES         10            \endif
\if :{?MIN_SHARPE}         \else \set MIN_SHARPE         0.40          \endif
\if :{?MIN_WIN_RATE}       \else \set MIN_WIN_RATE       0.55          \endif
\if :{?MIN_AVG_RET}        \else \set MIN_AVG_RET        0.00          \endif
\if :{?SIDE_FILTER}        \else \set SIDE_FILTER        NULL          \endif  
-- 'LONG'/'SHORT'/NULL
\if :{?MIN_CONF}           \else \set MIN_CONF           0.70          \endif
\if :{?USE_FULL_GRID}      \else \set USE_FULL_GRID      0             \endif
\if :{?REQUIRE_ROBUST}     \else \set REQUIRE_ROBUST     1             \endif
\if :{?NEIGHBOR_POS_EPS}   \else \set NEIGHBOR_POS_EPS   0.05          \endif  
-- ± pos_thresh
\if :{?NEIGHBOR_MM_EPS}    \else \set NEIGHBOR_MM_EPS    1             \endif  
-- ± min_mentions
\if :{?MIN_NEIGHBORS}      \else \set MIN_NEIGHBORS      1             \endif
\if :{?SHARPE_FRAC}        \else \set SHARPE_FRAC        0.75          \endif
\if :{?Q_MAX}              \else \set Q_MAX              NULL          \endif

-- ===== pick winners from backtest_sweep_results (default) or backtest_sweep_grid (when USE_FULL_GRID=1)

-- 1) base grid in the window for this model
WITH grid AS (
  SELECT
    model_version, symbol, horizon, side,
    min_mentions, pos_thresh,
    trades, avg_ret, median_ret, win_rate, stdev_ret, sharpe,
    start_date, end_date
  FROM backtest_sweep_results
  WHERE :USE_FULL_GRID::int = 0
    AND model_version = :'MODEL_VERSION'
    AND start_date    = :'START_DATE'::date
    AND end_date      = :'END_DATE'::date
  UNION ALL
  SELECT
    model_version, symbol, horizon, side,
    min_mentions, pos_thresh,
    trades, avg_ret, median_ret, win_rate, stdev_ret, sharpe,
    start_date, end_date
  FROM backtest_sweep_grid
  WHERE :USE_FULL_GRID::int = 1
    AND model_version = :'MODEL_VERSION'
    AND start_date    = :'START_DATE'::date
    AND end_date      = :'END_DATE'::date
),

-- 2) hard filters
filtered AS (
  SELECT *
  FROM grid
  WHERE trades   >= :'MIN_TRADES'::int
    AND (:'MIN_SHARPE'::numeric   IS NULL OR sharpe   >= :'MIN_SHARPE'::numeric)
    AND (:'MIN_WIN_RATE'::numeric IS NULL OR win_rate >= :'MIN_WIN_RATE'::numeric)
    AND (:'MIN_AVG_RET'::numeric  IS NULL OR avg_ret  >= :'MIN_AVG_RET'::numeric)
),

-- 3) p-values and BH FDR (q_value) per (symbol,horizon,side)
stats AS (
  SELECT
    f.*,
    CASE
      WHEN stdev_ret IS NULL OR stdev_ret = 0 OR trades <= 1
        THEN NULL
      ELSE (avg_ret / (stdev_ret / sqrt(trades)))::numeric
    END AS t_stat
  FROM filtered f
),
phi AS (
  -- Normal CDF approximation via GELU tanh fit: Phi(x) ~ 0.5 * (1 + tanh(√(2/π)*(x + 0.044715 x^3)))
  SELECT
    s.*,
    CASE
      WHEN t_stat IS NULL THEN NULL
      ELSE 0.5 * (1 + tanh(0.7978845608028654 * (t_stat + 0.044715 * (t_stat*t_stat*t_stat))))
    END AS phi
  FROM stats s
),
bh AS (
  SELECT
    p.*,
    CASE
      WHEN phi IS NULL THEN NULL
      ELSE LEAST(1.0, GREATEST(0.0, 2.0 * (1.0 - phi)))
    END AS p_value,
    CASE
      WHEN phi IS NULL THEN NULL
      ELSE (
        LEAST(1.0, GREATEST(0.0, 2.0 * (1.0 - phi)))
        * COUNT(*) OVER (PARTITION BY symbol,horizon,side)
        / NULLIF(RANK() OVER (PARTITION BY symbol,horizon,side ORDER BY LEAST(1.0, GREATEST(0.0, 2.0 * (1.0 - phi)))) ,0)
      )
    END AS q_value
  FROM phi p
),
bh_filtered AS (
  SELECT *
  FROM bh
  WHERE (:'Q_MAX'::numeric IS NULL OR q_value <= :'Q_MAX'::numeric)
),

-- 3) best per (symbol,horizon,side) by sharpe then trades
best_per AS (
  SELECT
    model_version, symbol, horizon, side,
    min_mentions, pos_thresh,
    trades, avg_ret, median_ret, win_rate, stdev_ret, sharpe, q_value,
    ROW_NUMBER() OVER (
      PARTITION BY model_version, symbol, horizon, side
      ORDER BY sharpe DESC NULLS LAST, trades DESC
    ) AS rk
  FROM bh_filtered
),

chosen AS (
  SELECT
    model_version, symbol, horizon, side,
    min_mentions, pos_thresh,
    trades, avg_ret, median_ret, win_rate, stdev_ret, sharpe, q_value
  FROM best_per
  WHERE rk = 1
),

-- 4) neighbor/robustness check around each chosen pocket
robust AS (
  SELECT
    c.model_version, c.symbol, c.horizon, c.side,
    c.min_mentions, c.pos_thresh,
    COUNT(*) FILTER (
      WHERE g.symbol IS NOT NULL
    ) AS neighbor_cnt
  FROM chosen c
  LEFT JOIN filtered g
    ON g.model_version = c.model_version
   AND g.symbol        = c.symbol
   AND g.horizon       = c.horizon
   AND g.side          = c.side
   AND ABS(g.pos_thresh   - c.pos_thresh)   <= (:'NEIGHBOR_POS_EPS')::numeric
   AND ABS(g.min_mentions - c.min_mentions) <= (:'NEIGHBOR_MM_EPS')::int
   AND (:'SHARPE_FRAC'::numeric IS NULL OR g.sharpe >= (:'SHARPE_FRAC')::numeric * c.sharpe)
  GROUP BY
    c.model_version, c.symbol, c.horizon, c.side,
    c.min_mentions, c.pos_thresh
),

final AS (
  SELECT
    c.model_version, c.symbol, c.horizon, c.side,
    c.min_mentions, c.pos_thresh,
    c.trades, c.avg_ret, c.median_ret, c.win_rate, c.stdev_ret, c.sharpe, c.q_value,
    r.neighbor_cnt
  FROM chosen c
  JOIN robust r
    ON r.model_version = c.model_version
   AND r.symbol        = c.symbol
   AND r.horizon       = c.horizon
   AND r.side          = c.side
   AND r.min_mentions  = c.min_mentions
   AND r.pos_thresh    = c.pos_thresh
  WHERE (:'REQUIRE_ROBUST'::int = 0 OR r.neighbor_cnt >= (:'MIN_NEIGHBORS')::int)
)

-- 5) upsert into live_sentiment_entry_rules
--    also populate metrics + window + a provenance note

INSERT INTO live_sentiment_entry_rules (
  model_version, symbol, horizon, side,
  min_mentions, pos_thresh, min_conf, use_weighted, is_enabled,
  trades, avg_ret, median_ret, win_rate, sharpe, q_value,
  start_date, end_date, notes, priority
)
SELECT
  model_version, symbol, horizon, side,
  min_mentions, pos_thresh,
  (:'MIN_CONF')::numeric, false, true,
  trades, avg_ret, median_ret, win_rate, sharpe, q_value,
  :'START_DATE'::date, :'END_DATE'::date,
  format(
    'auto-promoted from grid on %s | robust_neighbors=%s | q_value=%s | filters: MIN_TRADES=%s, MIN_SHARPE=%s, MIN_WIN_RATE=%s, MIN_AVG_RET=%s, Q_MAX=%s',
    now()::timestamptz, neighbor_cnt, q_value, :'MIN_TRADES', :'MIN_SHARPE', :'MIN_WIN_RATE', :'MIN_AVG_RET', :'Q_MAX'
  )::text,
  100
FROM final
ON CONFLICT (model_version, symbol, horizon, side)
DO UPDATE SET
  min_mentions = EXCLUDED.min_mentions,
  pos_thresh   = EXCLUDED.pos_thresh,
  min_conf     = EXCLUDED.min_conf,
  use_weighted = EXCLUDED.use_weighted,
  is_enabled   = true,
  trades       = EXCLUDED.trades,
  avg_ret      = EXCLUDED.avg_ret,
  median_ret   = EXCLUDED.median_ret,
  win_rate     = EXCLUDED.win_rate,
  sharpe       = EXCLUDED.sharpe,
  q_value      = EXCLUDED.q_value,
  start_date   = EXCLUDED.start_date,
  end_date     = EXCLUDED.end_date,
  notes        = EXCLUDED.notes,
  priority     = EXCLUDED.priority;

-- Optional: show why other "best" rules were not promoted this run
\echo 'Unpromoted best per symbol/horizon/side rules - that do not meet our filters'
WITH base AS (
  SELECT
    model_version, symbol, horizon, side,
    min_mentions, pos_thresh,
    trades, avg_ret, median_ret, win_rate, stdev_ret, sharpe,
    start_date, end_date
  FROM backtest_sweep_results
  WHERE :USE_FULL_GRID::int = 0
    AND model_version = :'MODEL_VERSION'
    AND start_date    = :'START_DATE'::date
    AND end_date      = :'END_DATE'::date
  UNION ALL
  SELECT
    model_version, symbol, horizon, side,
    min_mentions, pos_thresh,
    trades, avg_ret, median_ret, win_rate, stdev_ret, sharpe,
    start_date, end_date
  FROM backtest_sweep_grid
  WHERE :USE_FULL_GRID::int = 1
    AND model_version = :'MODEL_VERSION'
    AND start_date    = :'START_DATE'::date
    AND end_date      = :'END_DATE'::date
),
best AS (
  -- best per (symbol,horizon,side) by sharpe, tie-break by trades
  SELECT DISTINCT ON (symbol,horizon,side)
         symbol,horizon,side,min_mentions,pos_thresh,trades,avg_ret,median_ret,win_rate,stdev_ret,sharpe
  FROM base
  ORDER BY symbol,horizon,side, sharpe DESC NULLS LAST, trades DESC
),
nbrs AS (
  -- neighbors around each best config (robustness)
  SELECT b.symbol,b.horizon,b.side,
         COUNT(*) FILTER (
           WHERE r.trades >= :'MIN_TRADES'::int
             AND r.sharpe IS NOT NULL
             AND r.sharpe >= COALESCE(b.sharpe, -1e9) * :'SHARPE_FRAC'::numeric
             AND ABS(r.pos_thresh - b.pos_thresh) <= :'NEIGHBOR_POS_EPS'::numeric
             AND ABS(r.min_mentions - b.min_mentions) <= :'NEIGHBOR_MM_EPS'::int
         ) AS robust_neighbors
  FROM best b
  LEFT JOIN base r
    ON r.symbol=b.symbol AND r.horizon=b.horizon AND r.side=b.side
  GROUP BY 1,2,3
),
joined AS (
  SELECT b.*,
         n.robust_neighbors,
         (b.sharpe >= :'MIN_SHARPE'::numeric)          AS pass_sharpe,
         (b.win_rate >= :'MIN_WIN_RATE'::numeric)      AS pass_win,
         (b.avg_ret >= :'MIN_AVG_RET'::numeric)        AS pass_avg,
         (n.robust_neighbors >= :'MIN_NEIGHBORS'::int) AS pass_robust,
         CASE
           WHEN (:'REQUIRE_ROBUST'::int=1)
                THEN (b.sharpe >= :'MIN_SHARPE'::numeric
                      AND b.win_rate >= :'MIN_WIN_RATE'::numeric
                      AND b.avg_ret >= :'MIN_AVG_RET'::numeric
                      AND n.robust_neighbors >= :'MIN_NEIGHBORS'::int)
                ELSE (b.sharpe >= :'MIN_SHARPE'::numeric
                      AND b.win_rate >= :'MIN_WIN_RATE'::numeric
                      AND b.avg_ret >= :'MIN_AVG_RET'::numeric)
         END AS selected
  FROM best b
  JOIN nbrs n USING (symbol,horizon,side)
)
SELECT
  symbol, horizon, side, min_mentions, pos_thresh,
  trades, avg_ret, win_rate, sharpe, robust_neighbors,
  CASE
    WHEN (:'REQUIRE_ROBUST'::int=1)
         THEN (pass_sharpe AND pass_win AND pass_avg AND pass_robust)
         ELSE (pass_sharpe AND pass_win AND pass_avg)
  END AS selected,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN NOT pass_sharpe THEN 'sharpe' END,
    CASE WHEN NOT pass_win    THEN 'win_rate' END,
    CASE WHEN NOT pass_avg    THEN 'avg_ret' END,
    CASE WHEN (:'REQUIRE_ROBUST'::int=1 AND NOT pass_robust) THEN 'robust' END
  ], NULL) AS fail_reasons
FROM joined j
WHERE NOT selected
  AND (:'SIDE_FILTER' IS NULL OR side = :'SIDE_FILTER')
  AND NOT EXISTS (
    SELECT 1
    FROM live_sentiment_entry_rules r
    WHERE r.model_version = :'MODEL_VERSION'
      AND r.start_date    = :'START_DATE'::date
      AND r.end_date      = :'END_DATE'::date
      AND r.symbol        = j.symbol
      AND r.horizon       = j.horizon
      AND r.side          = j.side
      AND r.min_mentions  = j.min_mentions
      AND r.pos_thresh    = j.pos_thresh
      AND r.notes LIKE 'auto-promoted from grid%'
  )
ORDER BY selected DESC, sharpe DESC NULLS LAST, trades DESC, symbol, horizon, side;

-- Optional: show what we promoted this run
\echo 'Promoted rules (this window):'
SELECT
  model_version, symbol, horizon, side,
  min_mentions, pos_thresh, min_conf,
  trades, avg_ret, win_rate, sharpe, q_value,
  start_date, end_date
FROM live_sentiment_entry_rules
WHERE model_version = :'MODEL_VERSION'
  AND start_date = :'START_DATE'::date
  AND end_date   = :'END_DATE'::date
  AND notes LIKE 'auto-promoted from grid%'
ORDER BY sharpe DESC NULLS LAST, trades DESC, symbol, horizon, side;
