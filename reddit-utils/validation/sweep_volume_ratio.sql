\set ON_ERROR_STOP on

-- Parameters
\if :{?START_DATE}         \else \set START_DATE         '2025-06-01' \endif
\if :{?END_DATE}           \else \set END_DATE           '2025-09-22' \endif
\if :{?MODEL_VERSION}      \else \set MODEL_VERSION      'gpt-sent-v1' \endif
\if :{?RATIO_THRESH_LIST}  \else \set RATIO_THRESH_LIST   '1.05,1.10,1.15,1.20,1.25,1.30' \endif
\if :{?SHARE_THRESH_LIST}  \else \set SHARE_THRESH_LIST   'NULL,0.50,0.60' \endif
\if :{?SYMBOL_LIMIT}       \else \set SYMBOL_LIMIT       25 \endif

\echo '--- Volume Ratio / Share Sweep Parameters ---'
SELECT :'START_DATE'::date  AS start_date,
       :'END_DATE'::date    AS end_date,
       :'MODEL_VERSION'::text AS model_version,
       :'RATIO_THRESH_LIST'::text AS ratio_thresholds,
       :'SHARE_THRESH_LIST'::text AS share_thresholds;

WITH ratio_thresholds AS (
  SELECT trim(x)::numeric AS ratio_threshold
  FROM unnest(string_to_array(:'RATIO_THRESH_LIST', ',')) AS x
),
share_thresholds AS (
  SELECT CASE WHEN lower(trim(x)) = 'null' THEN NULL ELSE trim(x)::numeric END AS share_threshold
  FROM unnest(string_to_array(:'SHARE_THRESH_LIST', ',')) AS x
),
combo AS (
  SELECT rt.ratio_threshold, st.share_threshold
  FROM ratio_thresholds rt
  CROSS JOIN share_thresholds st
),
candidate_days AS (
  SELECT
    symbol,
    data_date,
    volume_ratio_avg_20,
    volume_share_20
  FROM v_market_rolling_features
  WHERE data_date BETWEEN :'START_DATE'::date AND :'END_DATE'::date
),
candidate_totals AS (
  SELECT COUNT(*) FILTER (WHERE volume_ratio_avg_20 IS NOT NULL) AS total_days
  FROM candidate_days
),
candidate_summary AS (
  SELECT
    c.ratio_threshold,
    c.share_threshold,
    COUNT(*) FILTER (
      WHERE cd.volume_ratio_avg_20 IS NOT NULL
        AND cd.volume_ratio_avg_20 >= c.ratio_threshold
        AND (
              c.share_threshold IS NULL
           OR (cd.volume_share_20 IS NOT NULL AND cd.volume_share_20 >= c.share_threshold)
            )
    ) AS passing_days
  FROM combo c
  CROSS JOIN candidate_days cd
  GROUP BY 1,2
),
candidate_results AS (
  SELECT
    cs.ratio_threshold,
    cs.share_threshold,
    cs.passing_days,
    ct.total_days,
    ROUND(cs.passing_days::numeric / NULLIF(ct.total_days,0) * 100, 2) AS pct_days
  FROM candidate_summary cs
  CROSS JOIN candidate_totals ct
)
SELECT 'candidate_coverage' AS section,
       ratio_threshold,
       share_threshold,
       passing_days,
       total_days,
       pct_days
FROM candidate_results
ORDER BY ratio_threshold, share_threshold;

-- Pocket coverage (based on baseline backtest_sweep_grid entries)
WITH ratio_thresholds AS (
  SELECT trim(x)::numeric AS ratio_threshold
  FROM unnest(string_to_array(:'RATIO_THRESH_LIST', ',')) AS x
),
share_thresholds AS (
  SELECT CASE WHEN lower(trim(x)) = 'null' THEN NULL ELSE trim(x)::numeric END AS share_threshold
  FROM unnest(string_to_array(:'SHARE_THRESH_LIST', ',')) AS x
),
combo AS (
  SELECT rt.ratio_threshold, st.share_threshold
  FROM ratio_thresholds rt
  CROSS JOIN share_thresholds st
),
pocket_base AS (
  SELECT
    symbol,
    horizon,
    side,
    trades,
    avg_volume_ratio_avg_20,
    avg_volume_share_20
  FROM backtest_sweep_grid
  WHERE model_version = :'MODEL_VERSION'
    AND start_date = :'START_DATE'::date
    AND end_date   = :'END_DATE'::date
),
pocket_totals AS (
  SELECT COUNT(*) AS total_pockets,
         SUM(trades) AS total_trades
  FROM pocket_base
),
pocket_summary AS (
  SELECT
    c.ratio_threshold,
    c.share_threshold,
    COUNT(*) FILTER (
      WHERE pb.avg_volume_ratio_avg_20 IS NOT NULL
        AND pb.avg_volume_ratio_avg_20 >= c.ratio_threshold
        AND (
              c.share_threshold IS NULL
           OR (pb.avg_volume_share_20 IS NOT NULL AND pb.avg_volume_share_20 >= c.share_threshold)
            )
    ) AS passing_pockets,
    SUM(pb.trades) FILTER (
      WHERE pb.avg_volume_ratio_avg_20 IS NOT NULL
        AND pb.avg_volume_ratio_avg_20 >= c.ratio_threshold
        AND (
              c.share_threshold IS NULL
           OR (pb.avg_volume_share_20 IS NOT NULL AND pb.avg_volume_share_20 >= c.share_threshold)
            )
    ) AS passing_trades
  FROM combo c
  CROSS JOIN pocket_base pb
  GROUP BY 1,2
),
pocket_results AS (
  SELECT
    ps.ratio_threshold,
    ps.share_threshold,
    ps.passing_pockets,
    pt.total_pockets,
    ROUND(ps.passing_pockets::numeric / NULLIF(pt.total_pockets,0) * 100, 2) AS pct_pockets,
    ps.passing_trades,
    pt.total_trades,
    ROUND(ps.passing_trades::numeric / NULLIF(pt.total_trades,0) * 100, 2) AS pct_trades
  FROM pocket_summary ps
  CROSS JOIN pocket_totals pt
)
SELECT 'pocket_coverage' AS section,
       ratio_threshold,
       share_threshold,
       passing_pockets,
       total_pockets,
       pct_pockets,
       passing_trades,
       total_trades,
       pct_trades
FROM pocket_results
ORDER BY ratio_threshold, share_threshold;

-- Per-symbol ratio percentiles (top symbols by p80)
WITH ratio_percentiles AS (
  SELECT
    symbol,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY volume_ratio_avg_20) AS ratio_p50,
    PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY volume_ratio_avg_20) AS ratio_p80,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY volume_ratio_avg_20) AS ratio_p90
  FROM v_market_rolling_features
  WHERE data_date BETWEEN :'START_DATE'::date AND :'END_DATE'::date
  GROUP BY 1
)
SELECT 'ratio_percentiles' AS section,
       symbol,
       ROUND(ratio_p50::numeric, 4) AS ratio_p50,
       ROUND(ratio_p80::numeric, 4) AS ratio_p80,
       ROUND(ratio_p90::numeric, 4) AS ratio_p90
FROM ratio_percentiles
ORDER BY ratio_p80 DESC NULLS LAST, symbol
LIMIT :'SYMBOL_LIMIT'::int;

-- Per-symbol share percentiles (top symbols by p80)
WITH share_percentiles AS (
  SELECT
    symbol,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY volume_share_20) AS share_p50,
    PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY volume_share_20) AS share_p80,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY volume_share_20) AS share_p90
  FROM v_market_rolling_features
  WHERE data_date BETWEEN :'START_DATE'::date AND :'END_DATE'::date
  GROUP BY 1
)
SELECT 'share_percentiles' AS section,
       symbol,
       ROUND(share_p50::numeric, 4) AS share_p50,
       ROUND(share_p80::numeric, 4) AS share_p80,
       ROUND(share_p90::numeric, 4) AS share_p90
FROM share_percentiles
ORDER BY share_p80 DESC NULLS LAST, symbol
LIMIT :'SYMBOL_LIMIT'::int;

\echo '--- Sweep complete ---'
