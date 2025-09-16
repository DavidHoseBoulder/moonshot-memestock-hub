\set ON_ERROR_STOP on

-- Optional validation-specific parameters
\if :{?SAMPLE_SYMBOLS}     \else \set SAMPLE_SYMBOLS       ''            \endif
\if :{?SHARPE_TOP_K}       \else \set SHARPE_TOP_K         10            \endif
\if :{?LB_TOP_K}           \else \set LB_TOP_K             10            \endif
\if :{?FDR_Q_MAX}          \else \set FDR_Q_MAX            0.10          \endif
\if :{?FDR_TRIM_POS_THRESH}\else \set FDR_TRIM_POS_THRESH 0.25          \endif

\echo '--- executing backtest_grid.sql for validation context ---'
\i ../backtest_grid.sql

-- Build helper table of sample symbols for parity spot-checks
DROP TABLE IF EXISTS tmp_validation_samples;
CREATE TEMP TABLE tmp_validation_samples AS
WITH provided AS (
  SELECT DISTINCT UPPER(BTRIM(value)) AS symbol
  FROM regexp_split_to_table(
         NULLIF(BTRIM(:'SAMPLE_SYMBOLS'), ''),
         ','
       ) AS value
  WHERE UPPER(BTRIM(value)) IS NOT NULL
),
ranked AS (
  SELECT symbol
  FROM tmp_results
  ORDER BY trades DESC, symbol
  LIMIT 3
)
SELECT symbol
FROM (
  SELECT symbol FROM provided
  UNION
  SELECT symbol FROM ranked
) s
WHERE symbol IS NOT NULL;

\echo '--- full-grid persistence parity ---'
SELECT 'tmp_results_count' AS check_name, COUNT(*) AS n_rows FROM tmp_results;
SELECT 'persisted_count'   AS check_name, COUNT(*) AS n_rows
FROM backtest_sweep_grid
WHERE model_version = :'MODEL_VERSION'
  AND start_date    = :'START_DATE'::date
  AND end_date      = :'END_DATE'::date;

SELECT 'missing_in_persisted' AS issue, COUNT(*) AS n_rows
FROM tmp_results r
LEFT JOIN backtest_sweep_grid p
  ON p.model_version = r.model_version
 AND p.start_date    = r.start_date
 AND p.end_date      = r.end_date
 AND p.symbol        = r.symbol
 AND p.horizon       = r.horizon
 AND p.side          = r.side
 AND p.min_mentions  = r.min_mentions
 AND p.pos_thresh    = r.pos_thresh
WHERE p.model_version IS NULL;

SELECT 'extra_in_persisted' AS issue, COUNT(*) AS n_rows
FROM backtest_sweep_grid p
LEFT JOIN tmp_results r
  ON r.model_version = p.model_version
 AND r.start_date    = p.start_date
 AND r.end_date      = p.end_date
 AND r.symbol        = p.symbol
 AND r.horizon       = p.horizon
 AND r.side          = p.side
 AND r.min_mentions  = p.min_mentions
 AND r.pos_thresh    = p.pos_thresh
WHERE r.model_version IS NULL
  AND p.model_version = :'MODEL_VERSION'
  AND p.start_date    = :'START_DATE'::date
  AND p.end_date      = :'END_DATE'::date;

\echo '--- parity spot-checks (sample symbols) ---'
SELECT
  r.symbol,
  r.horizon,
  r.side,
  r.min_mentions,
  r.pos_thresh,
  r.trades        AS tmp_trades,
  p.trades        AS persisted_trades,
  ROUND(r.avg_ret, 8)     AS tmp_avg_ret,
  ROUND(p.avg_ret, 8)     AS persisted_avg_ret,
  ROUND(r.win_rate, 4)    AS tmp_win_rate,
  ROUND(p.win_rate, 4)    AS persisted_win_rate,
  ROUND(r.sharpe, 4)      AS tmp_sharpe,
  ROUND(p.sharpe, 4)      AS persisted_sharpe
FROM tmp_results r
JOIN backtest_sweep_grid p
  ON p.model_version = r.model_version
 AND p.start_date    = r.start_date
 AND p.end_date      = r.end_date
 AND p.symbol        = r.symbol
 AND p.horizon       = r.horizon
 AND p.side          = r.side
 AND p.min_mentions  = r.min_mentions
 AND p.pos_thresh    = r.pos_thresh
WHERE EXISTS (
  SELECT 1 FROM tmp_validation_samples s WHERE s.symbol = r.symbol
)
ORDER BY r.symbol, r.horizon, r.side, r.min_mentions, r.pos_thresh;

SELECT
  r.symbol,
  r.horizon,
  r.side,
  r.min_mentions,
  r.pos_thresh,
  (p.avg_ret - r.avg_ret)       AS avg_ret_delta,
  (p.win_rate - r.win_rate)     AS win_rate_delta,
  (p.sharpe   - r.sharpe)       AS sharpe_delta
FROM tmp_results r
JOIN backtest_sweep_grid p
  ON p.model_version = r.model_version
 AND p.start_date    = r.start_date
 AND p.end_date      = r.end_date
 AND p.symbol        = r.symbol
 AND p.horizon       = r.horizon
 AND p.side          = r.side
 AND p.min_mentions  = r.min_mentions
 AND p.pos_thresh    = r.pos_thresh
WHERE EXISTS (
  SELECT 1 FROM tmp_validation_samples s WHERE s.symbol = r.symbol
)
  AND (
        ABS(p.avg_ret - r.avg_ret)   > 1e-9
     OR ABS(p.win_rate - r.win_rate) > 1e-9
     OR ABS(p.sharpe - r.sharpe)     > 1e-9
  )
ORDER BY r.symbol, r.horizon, r.side, r.min_mentions, r.pos_thresh;

\echo '--- fold diagnostics coverage ---'
SELECT
  COUNT(*)                            AS pockets,
  COUNT(*) FILTER (WHERE d.train_trades IS NOT NULL) AS with_train_diag,
  COUNT(*) FILTER (WHERE d.valid_trades IS NOT NULL) AS with_valid_diag,
  COUNT(*) FILTER (
    WHERE d.train_sharpe IS NOT NULL AND d.valid_sharpe IS NOT NULL
  ) AS with_both_sharpes
FROM tmp_results_gated r
LEFT JOIN tmp_fold_diag d
  ON d.symbol       = r.symbol
 AND d.horizon      = r.horizon
 AND d.side         = r.side
 AND d.min_mentions = r.min_mentions
 AND d.pos_thresh   = r.pos_thresh;

SELECT
  r.symbol,
  r.horizon,
  r.side,
  r.min_mentions,
  r.pos_thresh,
  d.train_trades,
  d.valid_trades,
  ROUND(d.train_sharpe, 4) AS train_sharpe,
  ROUND(d.valid_sharpe, 4) AS valid_sharpe,
  d.r_train_rank,
  d.r_valid_rank
FROM tmp_results_gated r
JOIN tmp_fold_diag d
  ON d.symbol       = r.symbol
 AND d.horizon      = r.horizon
 AND d.side         = r.side
 AND d.min_mentions = r.min_mentions
 AND d.pos_thresh   = r.pos_thresh
WHERE EXISTS (
  SELECT 1 FROM tmp_validation_samples s WHERE s.symbol = r.symbol
)
ORDER BY r.symbol, r.horizon, r.side, r.min_mentions, r.pos_thresh;

\echo '--- LB vs. Sharpe top-k comparison ---'
WITH base AS (
  SELECT
    r.symbol,
    r.horizon,
    r.side,
    r.min_mentions,
    r.pos_thresh,
    r.trades,
    r.avg_ret,
    r.lb,
    r.sharpe
  FROM tmp_results_gated r
  WHERE EXISTS (
    SELECT 1 FROM tmp_validation_samples s WHERE s.symbol = r.symbol
  )
),
sharpe_ranked AS (
  SELECT b.*, ROW_NUMBER() OVER (
           PARTITION BY symbol
           ORDER BY sharpe DESC NULLS LAST, trades DESC, avg_ret DESC
         ) AS sharpe_rank
  FROM base b
),
lb_ranked AS (
  SELECT b.*, ROW_NUMBER() OVER (
           PARTITION BY symbol
           ORDER BY lb DESC NULLS LAST, sharpe DESC NULLS LAST, trades DESC
         ) AS lb_rank
  FROM base b
)
SELECT
  COALESCE(s.symbol, l.symbol)        AS symbol,
  COALESCE(s.horizon, l.horizon)      AS horizon,
  COALESCE(s.side, l.side)            AS side,
  COALESCE(s.min_mentions, l.min_mentions) AS min_mentions,
  COALESCE(s.pos_thresh, l.pos_thresh)    AS pos_thresh,
  s.sharpe_rank,
  l.lb_rank,
  ROUND(s.sharpe, 4) AS sharpe,
  ROUND(l.lb, 4)     AS lb,
  COALESCE(s.trades, l.trades) AS trades
FROM sharpe_ranked s
FULL OUTER JOIN lb_ranked l
  ON s.symbol       = l.symbol
 AND s.horizon      = l.horizon
 AND s.side         = l.side
 AND s.min_mentions = l.min_mentions
 AND s.pos_thresh   = l.pos_thresh
WHERE (s.sharpe_rank IS NOT NULL AND s.sharpe_rank <= (:'SHARPE_TOP_K')::int)
   OR (l.lb_rank IS NOT NULL AND l.lb_rank     <= (:'LB_TOP_K')::int)
ORDER BY symbol, COALESCE(l.lb_rank, s.sharpe_rank), COALESCE(s.sharpe_rank, l.lb_rank);

\echo '--- FDR acceptance vs. grid breadth ---'
WITH candidate AS (
  SELECT
    r.symbol,
    r.horizon,
    r.side,
    r.min_mentions,
    r.pos_thresh,
    r.trades,
    r.avg_ret,
    r.stdev_ret,
    r.sharpe
  FROM tmp_results r
),
stats AS (
  SELECT
    c.*,
    CASE
      WHEN c.stdev_ret IS NULL OR c.stdev_ret = 0 OR c.trades <= 1 THEN NULL
      ELSE (c.avg_ret / (c.stdev_ret / sqrt(c.trades)))::numeric
    END AS t_stat
  FROM candidate c
),
phi AS (
  SELECT
    s.*,
    CASE
      WHEN s.t_stat IS NULL THEN NULL
      ELSE 0.5 * (1 + tanh(0.7978845608028654 * (s.t_stat + 0.044715 * (s.t_stat * s.t_stat * s.t_stat))))
    END AS phi
  FROM stats s
),
bh AS (
  SELECT
    p.*,
    CASE
      WHEN p.phi IS NULL THEN NULL
      ELSE LEAST(1.0, GREATEST(0.0, 2.0 * (1.0 - p.phi)))
    END AS p_value,
    CASE
      WHEN p.phi IS NULL THEN NULL
      ELSE (
        LEAST(1.0, GREATEST(0.0, 2.0 * (1.0 - p.phi)))
        * COUNT(*) OVER (PARTITION BY p.symbol, p.horizon, p.side)
        / NULLIF(RANK() OVER (
            PARTITION BY p.symbol, p.horizon, p.side
            ORDER BY LEAST(1.0, GREATEST(0.0, 2.0 * (1.0 - p.phi)))
          ), 0)
      )
    END AS q_value
  FROM phi p
),
scenario AS (
  SELECT 'wide'::text AS scenario, q_value
  FROM bh
  UNION ALL
  SELECT 'trimmed'::text AS scenario, q_value
  FROM bh
  WHERE pos_thresh <= (:'FDR_TRIM_POS_THRESH')::numeric
)
SELECT
  scenario,
  COUNT(*)                                  AS pockets,
  COUNT(*) FILTER (WHERE q_value IS NOT NULL) AS with_q,
  COUNT(*) FILTER (
    WHERE q_value IS NOT NULL AND q_value <= (:'FDR_Q_MAX')::numeric
  )                                           AS q_pass
FROM scenario
GROUP BY scenario
ORDER BY scenario;

\echo '--- validation complete ---'
