\set ON_ERROR_STOP on

-- Defaults mirroring promote_rules_from_grid.sql (override via -v as needed)
\if :{?MODEL_VERSION}      \else \set MODEL_VERSION      'gpt-sent-v1' \endif
\if :{?START_DATE}         \else \set START_DATE         '2025-06-01'  \endif
\if :{?END_DATE}           \else \set END_DATE           '2025-09-12'  \endif
\if :{?MIN_TRADES}         \else \set MIN_TRADES         10            \endif
\if :{?MIN_SHARPE}         \else \set MIN_SHARPE         0.40          \endif
\if :{?MIN_WIN_RATE}       \else \set MIN_WIN_RATE       0.55          \endif
\if :{?MIN_AVG_RET}        \else \set MIN_AVG_RET        0.00          \endif
\if :{?SIDE_FILTER}        \else \set SIDE_FILTER        NULL          \endif
\if :{?Q_MAX}              \else \set Q_MAX              NULL          \endif
\if :{?NEIGHBOR_POS_EPS}   \else \set NEIGHBOR_POS_EPS   0.05          \endif
\if :{?NEIGHBOR_MM_EPS}    \else \set NEIGHBOR_MM_EPS    1             \endif
\if :{?MIN_NEIGHBORS}      \else \set MIN_NEIGHBORS      1             \endif
\if :{?SHARPE_FRAC}        \else \set SHARPE_FRAC        0.75          \endif
\if :{?REQUIRE_ROBUST}     \else \set REQUIRE_ROBUST     1             \endif

DROP TABLE IF EXISTS tmp_compare_selected;
WITH params AS (
  SELECT
    CASE
      WHEN :Q_MAX IS NULL THEN NULL::numeric
      WHEN BTRIM(CAST(:Q_MAX AS text)) = '' THEN NULL::numeric
      WHEN UPPER(BTRIM(CAST(:Q_MAX AS text))) = 'NULL' THEN NULL::numeric
      ELSE (:Q_MAX)::numeric
    END AS q_max,
    NULLIF(BTRIM(CAST(:SIDE_FILTER AS text)), '') AS side_filter
),
grid AS (
  SELECT
    'WINNERS'::text AS source,
    model_version, symbol, horizon, side,
    min_mentions, pos_thresh,
    trades, avg_ret, median_ret, win_rate, stdev_ret, sharpe
  FROM backtest_sweep_results
  WHERE model_version = :'MODEL_VERSION'
    AND start_date    = :'START_DATE'::date
    AND end_date      = :'END_DATE'::date
  UNION ALL
  SELECT
    'FULL'::text AS source,
    model_version, symbol, horizon, side,
    min_mentions, pos_thresh,
    trades, avg_ret, median_ret, win_rate, stdev_ret, sharpe
  FROM backtest_sweep_grid
  WHERE model_version = :'MODEL_VERSION'
    AND start_date    = :'START_DATE'::date
    AND end_date      = :'END_DATE'::date
),
filtered AS (
  SELECT *
  FROM grid
  WHERE trades   >= :'MIN_TRADES'::int
    AND (:'MIN_SHARPE'::numeric   IS NULL OR sharpe   >= :'MIN_SHARPE'::numeric)
    AND (:'MIN_WIN_RATE'::numeric IS NULL OR win_rate >= :'MIN_WIN_RATE'::numeric)
    AND (:'MIN_AVG_RET'::numeric  IS NULL OR avg_ret  >= :'MIN_AVG_RET'::numeric)
    AND ( (SELECT side_filter FROM params) IS NULL
          OR side = (SELECT side_filter FROM params) )
),
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
        * COUNT(*) OVER (PARTITION BY source, symbol, horizon, side)
        / NULLIF(RANK() OVER (
             PARTITION BY source, symbol, horizon, side
             ORDER BY LEAST(1.0, GREATEST(0.0, 2.0 * (1.0 - phi)))
          ), 0)
      )
    END AS q_value
  FROM phi p
),
bh_filtered AS (
  SELECT
    b.*
  FROM bh b
  CROSS JOIN params pr
  WHERE pr.q_max IS NULL OR b.q_value <= pr.q_max
),
best_per AS (
  SELECT
    b.*,
    ROW_NUMBER() OVER (
      PARTITION BY source, model_version, symbol, horizon, side
      ORDER BY sharpe DESC NULLS LAST, trades DESC
    ) AS rk
  FROM bh_filtered b
),
chosen AS (
  SELECT *
  FROM best_per
  WHERE rk = 1
),
robust AS (
  SELECT
    c.source,
    c.model_version,
    c.symbol,
    c.horizon,
    c.side,
    c.min_mentions,
    c.pos_thresh,
    COUNT(*) FILTER (
      WHERE f.symbol IS NOT NULL
        AND ABS(f.pos_thresh   - c.pos_thresh)   <= (:'NEIGHBOR_POS_EPS')::numeric
        AND ABS(f.min_mentions - c.min_mentions) <= (:'NEIGHBOR_MM_EPS')::int
        AND (:'SHARPE_FRAC'::numeric IS NULL OR f.sharpe >= (:'SHARPE_FRAC')::numeric * c.sharpe)
    ) AS neighbor_cnt
  FROM chosen c
  LEFT JOIN filtered f
    ON f.source        = c.source
   AND f.model_version = c.model_version
   AND f.symbol        = c.symbol
   AND f.horizon       = c.horizon
   AND f.side          = c.side
  GROUP BY 1,2,3,4,5,6,7
),
selected AS (
  SELECT
    c.source,
    c.model_version,
    c.symbol,
    c.horizon,
    c.side,
    c.min_mentions,
    c.pos_thresh,
    c.trades,
    c.avg_ret,
    c.win_rate,
    c.sharpe,
    c.q_value,
    r.neighbor_cnt,
    (r.neighbor_cnt >= (:'MIN_NEIGHBORS')::int) AS pass_neighbors,
    ( (:'REQUIRE_ROBUST')::int = 0
      OR ( (:'REQUIRE_ROBUST')::int = 1 AND r.neighbor_cnt >= (:'MIN_NEIGHBORS')::int )
    ) AS promoted
  FROM chosen c
  JOIN robust r
    ON r.source        = c.source
   AND r.model_version = c.model_version
   AND r.symbol        = c.symbol
   AND r.horizon       = c.horizon
   AND r.side          = c.side
   AND r.min_mentions  = c.min_mentions
   AND r.pos_thresh    = c.pos_thresh
)
SELECT *
INTO TEMP TABLE tmp_compare_selected
FROM selected;

DROP TABLE IF EXISTS tmp_compare_winners;
CREATE TEMP TABLE tmp_compare_winners AS
SELECT * FROM tmp_compare_selected WHERE source = 'WINNERS';

DROP TABLE IF EXISTS tmp_compare_full;
CREATE TEMP TABLE tmp_compare_full AS
SELECT * FROM tmp_compare_selected WHERE source = 'FULL';

SELECT
  scope,
  total_rows,
  promoted_rows
FROM (
  SELECT 'WINNERS'::text AS scope,
         COUNT(*) AS total_rows,
         COUNT(*) FILTER (WHERE promoted) AS promoted_rows
  FROM tmp_compare_winners
  UNION ALL
  SELECT 'FULL'::text AS scope,
         COUNT(*) AS total_rows,
         COUNT(*) FILTER (WHERE promoted) AS promoted_rows
  FROM tmp_compare_full
) summary
ORDER BY scope;

\echo '-- winners promoted rows --'
SELECT
  symbol,
  horizon,
  side,
  min_mentions,
  pos_thresh,
  neighbor_cnt,
  q_value
FROM tmp_compare_winners
WHERE promoted
ORDER BY symbol, horizon, side, min_mentions, pos_thresh;

\echo '-- winners filtered rows --'
SELECT
  symbol,
  horizon,
  side,
  min_mentions,
  pos_thresh,
  neighbor_cnt,
  q_value
FROM tmp_compare_winners
WHERE NOT promoted
ORDER BY symbol, horizon, side, min_mentions, pos_thresh;

SELECT
  COALESCE(w.symbol, f.symbol)        AS symbol,
  COALESCE(w.horizon, f.horizon)      AS horizon,
  COALESCE(w.side, f.side)            AS side,
  COALESCE(w.min_mentions, f.min_mentions) AS min_mentions,
  COALESCE(w.pos_thresh, f.pos_thresh)    AS pos_thresh,
  w.neighbor_cnt   AS winners_neighbors,
  f.neighbor_cnt   AS full_neighbors,
  w.promoted       AS winners_promoted,
  f.promoted       AS full_promoted,
  COALESCE(w.q_value, f.q_value)      AS q_value,
  CASE
    WHEN COALESCE(w.promoted,false) AND NOT COALESCE(f.promoted,false)
      THEN 'lost_with_full_grid'
    WHEN NOT COALESCE(w.promoted,false) AND COALESCE(f.promoted,false)
      THEN 'gained_with_full_grid'
    WHEN COALESCE(w.promoted,false) AND COALESCE(f.promoted,false)
      THEN 'unchanged'
    ELSE 'filtered_in_both'
  END AS comparison
FROM tmp_compare_winners w
FULL OUTER JOIN tmp_compare_full f
  ON w.symbol       = f.symbol
 AND w.horizon      = f.horizon
 AND w.side         = f.side
 AND w.min_mentions = f.min_mentions
 AND w.pos_thresh   = f.pos_thresh
ORDER BY comparison DESC, symbol, horizon, side, min_mentions, pos_thresh;
