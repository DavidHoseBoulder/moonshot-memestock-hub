\set ON_ERROR_STOP on

-- Parameters (override via -v)
\if :{?MODEL_VERSION}      \else \set MODEL_VERSION      'gpt-sent-v1' \endif
\if :{?START_DATE}         \else \set START_DATE         '2025-06-01'  \endif
\if :{?END_DATE}           \else \set END_DATE           '2025-09-12'  \endif
\if :{?USE_FULL_GRID}      \else \set USE_FULL_GRID      1             \endif
\if :{?NEIGHBOR_POS_EPS}   \else \set NEIGHBOR_POS_EPS   0.05          \endif
\if :{?NEIGHBOR_MM_EPS}    \else \set NEIGHBOR_MM_EPS    1             \endif
\if :{?SHARPE_FRAC}        \else \set SHARPE_FRAC        0.75          \endif
\if :{?Q_MAX}              \else \set Q_MAX              NULL          \endif
\if :{?BAND_FILTER}       \else \set BAND_FILTER       'ALL'         \endif
\if :{?BAND_STRONG}        \else \set BAND_STRONG        0.35          \endif
\if :{?BAND_MODERATE}      \else \set BAND_MODERATE      0.20          \endif
\if :{?BAND_WEAK}          \else \set BAND_WEAK          0.10          \endif

-- Build temp tables so we can reuse across queries
DROP TABLE IF EXISTS rep_promoted;
CREATE TEMP TABLE rep_promoted AS
SELECT
  model_version, symbol, horizon, side,
  min_mentions, pos_thresh, min_conf,
  trades, avg_ret, median_ret, win_rate, sharpe, q_value,
  start_date, end_date
FROM live_sentiment_entry_rules
WHERE model_version = :'MODEL_VERSION'
  AND start_date    = :'START_DATE'::date
  AND end_date      = :'END_DATE'::date
  AND notes LIKE 'auto-promoted from grid%';

DROP TABLE IF EXISTS rep_grid;
CREATE TEMP TABLE rep_grid AS
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
  AND end_date      = :'END_DATE'::date;

DROP TABLE IF EXISTS rep_band_params;
CREATE TEMP TABLE rep_band_params AS
SELECT
  COALESCE(NULLIF(UPPER(:'BAND_FILTER'), ''), 'ALL') AS band_filter,
  (:'BAND_STRONG')::numeric   AS band_strong,
  (:'BAND_MODERATE')::numeric AS band_moderate,
  (:'BAND_WEAK')::numeric     AS band_weak,
  CASE
    WHEN :'Q_MAX' IS NULL THEN NULL
    WHEN BTRIM(:'Q_MAX') = '' THEN NULL
    WHEN UPPER(BTRIM(:'Q_MAX')) = 'NULL' THEN NULL
    ELSE (BTRIM(:'Q_MAX'))::numeric
  END AS q_max;

DROP TABLE IF EXISTS rep_promoted_filtered;
CREATE TEMP TABLE rep_promoted_filtered AS
SELECT p.*
FROM rep_promoted p
CROSS JOIN rep_band_params bf
WHERE bf.band_filter = 'ALL'
   OR (bf.band_filter = 'STRONG'   AND p.pos_thresh >= bf.band_strong)
   OR (bf.band_filter = 'MODERATE' AND p.pos_thresh >= bf.band_moderate)
   OR (bf.band_filter = 'WEAK'     AND p.pos_thresh >= bf.band_weak)
   OR (bf.band_filter = 'VERY_WEAK')
   OR (bf.band_filter NOT IN ('ALL','STRONG','MODERATE','WEAK','VERY_WEAK'));

DROP TABLE IF EXISTS rep_neighbors;
CREATE TEMP TABLE rep_neighbors AS
SELECT
  p.symbol, p.horizon, p.side, p.min_mentions, p.pos_thresh,
  COUNT(*) FILTER (
    WHERE g.symbol IS NOT NULL
      AND g.trades >= 1
      AND g.sharpe IS NOT NULL
      AND g.sharpe >= COALESCE(p.sharpe, -1e9) * (:'SHARPE_FRAC')::numeric
      AND ABS(g.pos_thresh   - p.pos_thresh)   <= (:'NEIGHBOR_POS_EPS')::numeric
      AND ABS(g.min_mentions - p.min_mentions) <= (:'NEIGHBOR_MM_EPS')::int
  ) AS neighbor_cnt
FROM rep_promoted p
LEFT JOIN rep_grid g
  ON g.symbol  = p.symbol
 AND g.horizon = p.horizon
 AND g.side    = p.side
GROUP BY 1,2,3,4,5;

DROP TABLE IF EXISTS rep_neighbors_filtered;
CREATE TEMP TABLE rep_neighbors_filtered AS
SELECT
  p.symbol, p.horizon, p.side, p.min_mentions, p.pos_thresh,
  COUNT(*) FILTER (
    WHERE g.symbol IS NOT NULL
      AND g.trades >= 1
      AND g.sharpe IS NOT NULL
      AND g.sharpe >= COALESCE(p.sharpe, -1e9) * (:'SHARPE_FRAC')::numeric
      AND ABS(g.pos_thresh   - p.pos_thresh)   <= (:'NEIGHBOR_POS_EPS')::numeric
      AND ABS(g.min_mentions - p.min_mentions) <= (:'NEIGHBOR_MM_EPS')::int
  ) AS neighbor_cnt
FROM rep_promoted_filtered p
LEFT JOIN rep_grid g
  ON g.symbol  = p.symbol
 AND g.horizon = p.horizon
 AND g.side    = p.side
GROUP BY 1,2,3,4,5;

-- Detailed listing
\echo '---'
\echo Band filter (min): :BAND_FILTER
SELECT
  p.symbol, p.horizon, p.side,
  p.min_mentions, p.pos_thresh,
  CASE
    WHEN p.pos_thresh >= (:'BAND_STRONG')::numeric   THEN 'STRONG'
    WHEN p.pos_thresh >= (:'BAND_MODERATE')::numeric THEN 'MODERATE'
    WHEN p.pos_thresh >= (:'BAND_WEAK')::numeric     THEN 'WEAK'
    ELSE 'VERY_WEAK'
  END AS band,
  p.trades, p.avg_ret, p.median_ret, p.win_rate, p.sharpe, p.q_value,
  bf.q_max,
  CASE WHEN bf.q_max IS NULL OR p.q_value IS NULL
       THEN NULL
       ELSE bf.q_max - p.q_value
  END AS q_margin,
  n.neighbor_cnt,
  (n.neighbor_cnt < 1) AS brittle
FROM rep_promoted_filtered p
JOIN rep_neighbors_filtered n USING (symbol,horizon,side,min_mentions,pos_thresh)
CROSS JOIN rep_band_params bf
ORDER BY brittle DESC, q_margin ASC NULLS LAST, p.sharpe ASC NULLS LAST, p.symbol;

-- Aggregates by horizon/side
\echo 'Summary by horizon/side (ALL vs filtered):'
SELECT
  scope,
  horizon,
  side,
  COUNT(*)                           AS n_rules,
  ROUND(AVG(sharpe)::numeric, 3)     AS mean_sharpe,
  MAX(bf.q_max)                      AS q_max,
  CASE
    WHEN MAX(bf.q_max) IS NULL THEN NULL
    ELSE COUNT(*) FILTER (
           WHERE q_value IS NOT NULL
             AND bf.q_max IS NOT NULL
             AND q_value <= bf.q_max
         )
  END AS n_q_pass,
  COUNT(*) FILTER (WHERE neighbor_cnt < 1) AS n_brittle
FROM (
  SELECT 'ALL'::text AS scope, p.horizon, p.side, p.sharpe, p.q_value, n.neighbor_cnt
  FROM rep_promoted p JOIN rep_neighbors n USING (symbol,horizon,side,min_mentions,pos_thresh)
  UNION ALL
  SELECT 'FILTERED'::text AS scope, p.horizon, p.side, p.sharpe, p.q_value, n.neighbor_cnt
  FROM rep_promoted_filtered p JOIN rep_neighbors_filtered n USING (symbol,horizon,side,min_mentions,pos_thresh)
) s
CROSS JOIN rep_band_params bf
GROUP BY 1,2,3
ORDER BY horizon, side, scope;

-- Aggregates by band
\echo 'Summary by band (ALL vs filtered):'
WITH banded AS (
  SELECT
    'ALL'::text AS scope,
    CASE
      WHEN p.pos_thresh >= bf.band_strong   THEN 'STRONG'
      WHEN p.pos_thresh >= bf.band_moderate THEN 'MODERATE'
      WHEN p.pos_thresh >= bf.band_weak     THEN 'WEAK'
      ELSE 'VERY_WEAK'
    END AS band,
    p.avg_ret,
    p.sharpe,
    p.q_value
  FROM rep_promoted p
  CROSS JOIN rep_band_params bf
  UNION ALL
  SELECT
    'FILTERED'::text AS scope,
    CASE
      WHEN p.pos_thresh >= bf.band_strong   THEN 'STRONG'
      WHEN p.pos_thresh >= bf.band_moderate THEN 'MODERATE'
      WHEN p.pos_thresh >= bf.band_weak     THEN 'WEAK'
      ELSE 'VERY_WEAK'
    END AS band,
    p.avg_ret,
    p.sharpe,
    p.q_value
  FROM rep_promoted_filtered p
  CROSS JOIN rep_band_params bf
)
SELECT
  scope,
  band,
  COUNT(*)                       AS n_rules,
  ROUND(AVG(sharpe)::numeric,3)  AS mean_sharpe,
  ROUND(AVG(avg_ret)::numeric,4) AS mean_avg_ret,
  CASE
    WHEN MAX(bf.q_max) IS NULL THEN NULL
    ELSE COUNT(*) FILTER (
           WHERE q_value IS NOT NULL
             AND bf.q_max IS NOT NULL
             AND q_value <= bf.q_max
         )
  END AS n_q_pass
FROM banded b
CROSS JOIN rep_band_params bf
GROUP BY 1,2
ORDER BY scope, band;
