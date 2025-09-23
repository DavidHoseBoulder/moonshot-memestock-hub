-- ==============================================
-- Usage
-- ==============================================
-- psql "$PGURI" \
--   -v MODEL_VERSION='gpt-sent-v1' \
--   -v START_DATE='2025-06-01' \
--   -v END_DATE='2025-09-12' \
--   -v MIN_CONF=0.70 \
--   -v MIN_MENTIONS_REQ=3 \
--   -v POS_RATE_MIN=0.55 \
--   -v AVG_ABS_MIN=0.10 \
--   -v MIN_MENTIONS_LIST='1,2,3,4,5,6,7,8' \
--   -v POS_THRESH_LIST='0.10,0.15,0.20,0.25,0.30,0.35,0.40' \
--   -v HORIZONS='1d,3d,5d' \
--   -v SIDES='LONG,SHORT' \
--   -v SYMBOLS=NULL \
--   -v MIN_TRADES=10 \
--   -v MIN_SHARPE=-999 \
--   -v DO_PERSIST=1 \
--   -v EXPORT_CSV=0 \\
--   -v CSV_PATH=/tmp/grid_results.csv \\
--   -f backtest_grid.sql
-- Note: set DO_PERSIST=1 to write to backtest_sweep_results; 0 skips persistence.
-- SYMBOLS can be NULL for all symbols or a comma-separated list like 'AAPL,TSLA'.
-- Optional CSV export: set EXPORT_CSV=1 and specify CSV_PATH to write a CSV via your wrapper script.
--
-- Recommended: run via runner script which respects CODE_DIR and WORKING_DIR:
--   ./run_grid.sh
-- Or call psql directly with CODE_DIR (defaults to reddit-utils path) and WORKING_DIR created:
--   CODE_DIR=${CODE_DIR:-"/home/dhose/moonshot-memestock-hub/reddit-utils"} \
--   WORKING_DIR=${WORKING_DIR:-"/home/dhose/reddit_work"} \
--   mkdir -p "$WORKING_DIR" && cd "$WORKING_DIR" && \
--   psql "$PGURI" \
--     -v MODEL_VERSION='gpt-sent-v1' \
--     -v START_DATE='2025-06-01' \
--     -v END_DATE='2025-09-12' \
--     -v MIN_CONF=0.70 \
--     -v MIN_MENTIONS_REQ=3 \
--     -v POS_RATE_MIN=0.55 \
--     -v AVG_ABS_MIN=0.10 \
--     -v MIN_MENTIONS_LIST='1,2,3,4,5,6,7,8' \
--     -v POS_THRESH_LIST='0.10,0.15,0.20,0.25,0.30,0.35,0.40' \
--     -v HORIZONS='1d,3d,5d' \
--     -v SIDES='LONG,SHORT' \
--     -v SYMBOLS=NULL \
--     -v MIN_TRADES=10 \
--     -v MIN_SHARPE=-999 \
--     -v DO_PERSIST=1 \
--     -v EXPORT_CSV=0 \\
--     -v CSV_PATH=/tmp/grid_results.csv \\
--     -f "$CODE_DIR/backtest_grid.sql"
-- Note on CSV export:
--   CSV writing uses SQL COPY to STDOUT plus "\g :CSV_PATH". Pass CSV_PATH without quotes,
--   e.g., -v EXPORT_CSV=1 -v CSV_PATH=/tmp/grid.csv
-- ==============================================
\set ON_ERROR_STOP on

-- ================================
-- Defaults (overridable via -v)
-- ================================
\if :{?MODEL_VERSION}     \else \set MODEL_VERSION      'gpt-sent-v1'          \endif
\if :{?START_DATE}        \else \set START_DATE         '2025-06-01'           \endif
\if :{?END_DATE}          \else \set END_DATE           '2025-09-12'           \endif
\if :{?MIN_CONF}          \else \set MIN_CONF           0.70                   \endif
\if :{?MIN_MENTIONS_REQ}  \else \set MIN_MENTIONS_REQ   3                      \endif
\if :{?POS_RATE_MIN}      \else \set POS_RATE_MIN       0.55                   \endif
\if :{?AVG_ABS_MIN}       \else \set AVG_ABS_MIN        0.10                   \endif
-- Debug logging toggle (0/1). Default 0 if not set by caller.
\if :{?DEBUG} \else \set DEBUG 0 \endif
\if :{?EXPORT_CSV}       \else \set EXPORT_CSV        0                        \endif
\if :{?CSV_PATH}         \else \set CSV_PATH          /tmp/grid_export.csv      \endif
\if :{?PERSIST_FULL_GRID}\else \set PERSIST_FULL_GRID 0                        \endif

-- Grid lists (CSV strings)
\if :{?MIN_MENTIONS_LIST} \else \set MIN_MENTIONS_LIST  '1,2,3,4,5'            \endif
\if :{?POS_THRESH_LIST}   \else \set POS_THRESH_LIST    '0.10,0.15,0.20,0.25'  \endif
\if :{?HORIZONS}          \else \set HORIZONS           '1d,3d,5d'             \endif
\if :{?SIDES}             \else \set SIDES              'LONG,SHORT'           \endif
-- Optional filter: comma-separated symbols or NULL for all
\if :{?SYMBOLS}           \else \set SYMBOLS            NULL                    \endif

-- Output control
\if :{?DO_PERSIST}        \else \set DO_PERSIST         0                       \endif
\if :{?MIN_TRADES}        \else \set MIN_TRADES         0                       \endif
\if :{?MIN_SHARPE}        \else \set MIN_SHARPE         -999                    \endif

-- Optional stability (train/valid) and ranking controls
\if :{?USE_FOLDS}               \else \set USE_FOLDS               0            \endif
\if :{?REQUIRE_STABLE}          \else \set REQUIRE_STABLE          :USE_FOLDS    \endif
\if :{?FOLD_FRAC}               \else \set FOLD_FRAC                0.70         \endif
\if :{?SHARPE_FRAC}             \else \set SHARPE_FRAC              0.70         \endif
\if :{?REQUIRE_RANK_CONSISTENT} \else \set REQUIRE_RANK_CONSISTENT  0            \endif
\if :{?RANK_TOP_K}              \else \set RANK_TOP_K               3            \endif

-- Lower-bound CI ranking/gating
\if :{?USE_LB_RANKING}          \else \set USE_LB_RANKING           0            \endif
\if :{?REQUIRE_LB_POSITIVE}     \else \set REQUIRE_LB_POSITIVE      0            \endif
\if :{?LB_Z}                    \else \set LB_Z                     1.64         \endif

-- Baseline uplift gating
\if :{?REQUIRE_UPLIFT_POSITIVE} \else \set REQUIRE_UPLIFT_POSITIVE  0            \endif

-- Score bands (based on pos_thresh)
\if :{?BAND_STRONG}            \else \set BAND_STRONG             0.35         \endif
\if :{?BAND_MODERATE}          \else \set BAND_MODERATE           0.20         \endif
\if :{?BAND_WEAK}              \else \set BAND_WEAK               0.10         \endif

-- ================================
-- 1) Base scored mentions (window, conf gate, optional symbol filter)
-- ================================
-- 1) Scored mentions in window (CONF gate + doc types)
DROP TABLE IF EXISTS tmp_scored;
CREATE TEMP TABLE tmp_scored AS
SELECT
  upper(m.symbol)              AS symbol,
  m.created_utc::date          AS d,
  s.score::numeric             AS score,
  s.confidence::numeric        AS conf
FROM reddit_mentions m
JOIN reddit_sentiment s
  ON s.mention_id = m.mention_id
WHERE s.model_version = :'MODEL_VERSION'
  AND m.created_utc::date >= (:'START_DATE')::date
  AND m.created_utc::date <  (:'END_DATE')::date
  AND COALESCE(s.confidence, 0) >= (:'MIN_CONF')::numeric
  AND m.doc_type IN ('post', 'comment')
  AND m.symbol IS NOT NULL AND m.symbol <> '';

\if :DEBUG
  SELECT 'tmp_scored_n' AS label, COUNT(*) AS n FROM tmp_scored;
  -- show why it might be empty
  SELECT 'window_echo' AS label, :'START_DATE'::text AS start_date, :'END_DATE'::text AS end_date, :'MODEL_VERSION'::text AS model;
  -- top symbols by rows (if any)
  SELECT symbol, COUNT(*) AS n
  FROM tmp_scored GROUP BY 1 ORDER BY n DESC LIMIT 10;
\endif


-- ================================
-- 2) Daily sentiment aggregates (per symbol/day)
-- ================================
DROP TABLE IF EXISTS tmp_daily;
CREATE TEMP TABLE tmp_daily AS
SELECT
  symbol,
  d,
  COUNT(*)                                  AS mentions,
  AVG(score)                                AS avg_raw,
  AVG(ABS(score))                           AS avg_abs,
  AVG((score > 0)::int)::numeric            AS pos_rate,
  AVG((score < 0)::int)::numeric            AS neg_rate
FROM tmp_scored
GROUP BY 1,2;

\if :DEBUG
  SELECT 'tmp_daily_n' AS label, COUNT(*) AS n FROM tmp_daily;
  -- if zero, peek the raw aggregates re-computed directly (quick sanity)
  WITH x AS (
    SELECT upper(m.symbol) AS symbol, m.created_utc::date AS d
    FROM reddit_mentions m
    JOIN reddit_sentiment s ON s.mention_id = m.mention_id
    WHERE s.model_version = :'MODEL_VERSION'
      AND m.created_utc::date >= (:'START_DATE')::date
      AND m.created_utc::date <  (:'END_DATE')::date
      AND COALESCE(s.confidence,0) >= (:'MIN_CONF')::numeric
      AND m.doc_type IN ('post','comment')
  )
  SELECT 'daily_raw_echo' AS label, COUNT(*) AS n
  FROM (SELECT symbol, d, COUNT(*) FROM x GROUP BY 1,2) q;
\endif

-- ================================
-- 3) Candidate days with basic quality guards
-- ================================
DROP TABLE IF EXISTS tmp_candidates;
CREATE TEMP TABLE tmp_candidates AS
SELECT
  d.symbol,
  d.d,
  d.mentions,
  d.avg_raw,
  d.avg_abs,
  d.pos_rate,
  d.neg_rate,
  f.volume_zscore_20,
  f.rsi_14
FROM tmp_daily d
LEFT JOIN v_market_rolling_features f
  ON f.symbol = d.symbol
 AND f.data_date = d.d
WHERE COALESCE(d.avg_abs,0) >= (:'AVG_ABS_MIN')::numeric;

\if :DEBUG
  SELECT 'tmp_candidates_n' AS label, COUNT(*) AS n FROM tmp_candidates;
  -- show gating thresholds actually used
  SELECT 'gates' AS label,
         (:'MIN_MENTIONS_REQ')::int    AS min_mentions_req,
         (:'POS_RATE_MIN')::numeric    AS pos_rate_min,
         (:'AVG_ABS_MIN')::numeric     AS avg_abs_min;
  -- show a few near-misses if zero candidates
  WITH misses AS (
    SELECT symbol, d, mentions, avg_raw, avg_abs, pos_rate, neg_rate
    FROM tmp_daily
    ORDER BY d DESC, mentions DESC
    LIMIT 50
  )
  SELECT * FROM misses;
\endif

-- ================================
-- 4) Parameter grid
-- ================================
DROP TABLE IF EXISTS tmp_grid;
CREATE TEMP TABLE tmp_grid AS
WITH mm AS (
  SELECT (trim(x))::int AS min_mentions
  FROM unnest(string_to_array(:'MIN_MENTIONS_LIST', ',')) AS x
),
pt AS (
  SELECT (trim(x))::numeric AS pos_thresh
  FROM unnest(string_to_array(:'POS_THRESH_LIST', ',')) AS x
),
hz AS (
  SELECT trim(x) AS horizon
  FROM unnest(string_to_array(:'HORIZONS', ',')) AS x
),
sd AS (
  SELECT trim(x) AS side
  FROM unnest(string_to_array(:'SIDES', ',')) AS x
)
SELECT mm.min_mentions, pt.pos_thresh, hz.horizon, sd.side
FROM mm CROSS JOIN pt CROSS JOIN hz CROSS JOIN sd;

\if :DEBUG
  SELECT 'tmp_grid_n' AS label, COUNT(*) AS n FROM tmp_grid;
  SELECT 'grid_ranges' AS label,
         MIN(min_mentions), MAX(min_mentions),
         MIN(pos_thresh),  MAX(pos_thresh)
  FROM tmp_grid;
  SELECT horizon, side, COUNT(*) AS n FROM tmp_grid GROUP BY 1,2 ORDER BY 1,2;
\endif

-- ================================
-- 5) Signals per (symbol, grid combo, day)
-- ================================
DROP TABLE IF EXISTS tmp_sig_start;
CREATE TEMP TABLE tmp_sig_start AS
SELECT
  c.symbol,
  g.horizon,
  g.side,
  CASE g.side WHEN 'LONG' THEN  1 ELSE -1 END AS dir,
  g.min_mentions,
  g.pos_thresh,
  c.d AS start_day,
  CASE g.horizon WHEN '1d' THEN 1 WHEN '3d' THEN 3 WHEN '5d' THEN 5 END AS hold_days,
  c.volume_zscore_20,
  c.rsi_14
FROM tmp_candidates c
JOIN tmp_grid g ON TRUE
WHERE c.mentions >= GREATEST( (:'MIN_MENTIONS_REQ')::int, g.min_mentions )
  AND (
        (g.side='LONG'  AND c.pos_rate >= (:'POS_RATE_MIN')::numeric AND c.avg_raw >=  g.pos_thresh)
     OR (g.side='SHORT' AND c.neg_rate >= (:'POS_RATE_MIN')::numeric AND c.avg_raw <= -g.pos_thresh)
      )
  AND c.symbol IS NOT NULL
  AND CASE g.horizon WHEN '1d' THEN 1 WHEN '3d' THEN 3 WHEN '5d' THEN 5 END IS NOT NULL;

  \if :DEBUG
  SELECT 'tmp_sig_start_n' AS label, COUNT(*) AS n FROM tmp_sig_start;
  -- when zero, show the top 20 days that passed quality gates but missed thresholds
  WITH q AS (
    SELECT c.symbol, c.d, c.mentions, c.avg_raw, g.side, g.pos_thresh
    FROM tmp_candidates c
    JOIN tmp_grid g ON TRUE
  )
  SELECT symbol, d, side, mentions, ROUND((avg_raw)::numeric,3) AS avg_raw, pos_thresh
  FROM q
  WHERE (side='LONG'  AND avg_raw <  pos_thresh)
     OR (side='SHORT' AND avg_raw > -pos_thresh)
  ORDER BY mentions DESC
  LIMIT 20;
\endif

-- ================================
-- 6) Prices with forward closes
-- ================================
DROP TABLE IF EXISTS tmp_px;
CREATE TEMP TABLE tmp_px AS
SELECT
  upper(symbol)                                   AS symbol,
  data_date::date                                 AS d,
  price_close::float8                             AS close,
  lead(price_close, 1) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t1,
  lead(price_close, 3) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t3,
  lead(price_close, 5) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t5
FROM enhanced_market_data;

\if :DEBUG
  SELECT 'tmp_px_n' AS label, COUNT(*) AS n FROM tmp_px;
  -- check price coverage on signal starts
  WITH k AS (
    SELECT DISTINCT symbol, start_day FROM tmp_sig_start
  )
  SELECT 'starts' AS label, COUNT(*) FROM k
  UNION ALL
  SELECT 'starts_with_px' AS label,
         COUNT(*) FROM k JOIN tmp_px p ON p.symbol=k.symbol AND p.d=k.start_day;
\endif

-- ================================
-- 7) Forward returns for each signal
-- ================================
DROP TABLE IF EXISTS tmp_fwd;
CREATE TEMP TABLE tmp_fwd AS
SELECT
  s.symbol, s.horizon, s.side, s.dir, s.min_mentions, s.pos_thresh,
  s.volume_zscore_20, s.rsi_14,
  s.start_day, s.hold_days,
  p.close AS entry_close,
  CASE s.hold_days
    WHEN 1 THEN p.close_t1
    WHEN 3 THEN p.close_t3
    WHEN 5 THEN p.close_t5
  END AS exit_close,
  CASE s.hold_days
    WHEN 1 THEN s.dir * (p.close_t1 / NULLIF(p.close, 0) - 1.0)
    WHEN 3 THEN s.dir * (p.close_t3 / NULLIF(p.close, 0) - 1.0)
    WHEN 5 THEN s.dir * (p.close_t5 / NULLIF(p.close, 0) - 1.0)
  END AS fwd_ret
FROM tmp_sig_start s
JOIN tmp_px p
  ON p.symbol = s.symbol
 AND p.d      = s.start_day
WHERE CASE s.hold_days
        WHEN 1 THEN p.close_t1
        WHEN 3 THEN p.close_t3
        WHEN 5 THEN p.close_t5
      END IS NOT NULL
  AND p.close IS NOT NULL
  AND p.close <> 0;

\if :DEBUG
  SELECT 'tmp_fwd_n' AS label, COUNT(*) AS n FROM tmp_fwd;
  SELECT side, horizon, COUNT(*) AS n,
         ROUND((AVG(fwd_ret))::numeric,5) AS avg_ret,
         ROUND(AVG((fwd_ret>0)::int),3) AS win_rate
  FROM tmp_fwd GROUP BY 1,2 ORDER BY 1,2;
\endif

-- ================================
-- 8) Optional folds (train/valid) for stability checks
-- ================================
DROP TABLE IF EXISTS tmp_folds;
CREATE TEMP TABLE tmp_folds AS
WITH bounds AS (
  SELECT MIN(start_day) AS min_d, MAX(start_day) AS max_d FROM tmp_fwd
)
SELECT f.*,
       CASE
         WHEN f.start_day < (
                b.min_d + ((b.max_d - b.min_d) * (:'FOLD_FRAC')::numeric)::int
              )
         THEN 'train' ELSE 'valid'
       END AS fold
FROM tmp_fwd f CROSS JOIN bounds b;

-- ================================
-- 9) Aggregate results (per-pocket)
-- ================================
DROP TABLE IF EXISTS tmp_results;
CREATE TEMP TABLE tmp_results AS
SELECT
  :'MODEL_VERSION'::text       AS model_version,
  :'START_DATE'::date          AS start_date,
  :'END_DATE'::date            AS end_date,
  f.symbol,
  f.horizon,
  f.side,
  f.min_mentions,
  f.pos_thresh,
  COUNT(*)::int                            AS trades,
  AVG(f.fwd_ret)::numeric                  AS avg_ret,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.fwd_ret)::numeric AS median_ret,
  AVG((f.fwd_ret > 0)::int)::numeric       AS win_rate,
  STDDEV_POP(f.fwd_ret)::numeric           AS stdev_ret,
  CASE
    WHEN STDDEV_POP(f.fwd_ret) IS NULL OR STDDEV_POP(f.fwd_ret)=0
      THEN NULL
    ELSE (AVG(f.fwd_ret)/STDDEV_POP(f.fwd_ret))::numeric
  END AS sharpe
FROM tmp_fwd f
GROUP BY 1,2,3,4,5,6,7,8
HAVING COUNT(*) >= (:'MIN_TRADES')::int
   AND COALESCE(
         CASE
           WHEN STDDEV_POP(f.fwd_ret) IS NULL OR STDDEV_POP(f.fwd_ret)=0
             THEN NULL
           ELSE (AVG(f.fwd_ret)/STDDEV_POP(f.fwd_ret))::numeric
         END,
       -999
       ) >= (:'MIN_SHARPE')::numeric;

-- Add lower-bound and convenience columns
ALTER TABLE tmp_results ADD COLUMN lb numeric;
UPDATE tmp_results
SET lb = avg_ret - ( (:'LB_Z')::numeric * (stdev_ret / NULLIF(sqrt(trades)::numeric,0)) );

-- ================================
-- 10) Stability gating via folds (optional)
-- ================================
DROP TABLE IF EXISTS tmp_fold_agg;
CREATE TEMP TABLE tmp_fold_agg AS
SELECT
  f.symbol, f.horizon, f.side, f.min_mentions, f.pos_thresh,
  f.fold,
  COUNT(*)::int AS trades,
  AVG(f.fwd_ret)::numeric AS avg_ret,
  CASE WHEN stddev_samp(f.fwd_ret)=0 OR stddev_samp(f.fwd_ret) IS NULL
       THEN NULL ELSE (AVG(f.fwd_ret)/stddev_samp(f.fwd_ret))::numeric END AS sharpe
FROM tmp_folds f
GROUP BY 1,2,3,4,5,6;

-- Fold diagnostics per pocket (trades + sharpe per fold)
DROP TABLE IF EXISTS tmp_fold_diag;
CREATE TEMP TABLE tmp_fold_diag AS
WITH s AS (
  SELECT
    symbol, horizon, side, min_mentions, pos_thresh,
    MIN(CASE WHEN fold='train' THEN trades END) AS train_trades,
    MIN(CASE WHEN fold='valid' THEN trades END) AS valid_trades,
    MIN(CASE WHEN fold='train' THEN sharpe END) AS train_sharpe,
    MIN(CASE WHEN fold='valid' THEN sharpe END) AS valid_sharpe
  FROM tmp_fold_agg
  GROUP BY 1,2,3,4,5
), r_train AS (
  SELECT s.*, RANK() OVER (
           PARTITION BY symbol, horizon, side
           ORDER BY train_sharpe DESC NULLS LAST
         ) AS r_train_rank
  FROM s
)
SELECT r_train.*,
       RANK() OVER (
         PARTITION BY symbol, horizon, side
         ORDER BY valid_sharpe DESC NULLS LAST
       ) AS r_valid_rank
FROM r_train;

-- Set of pockets that pass train/valid sharpe gates
DROP TABLE IF EXISTS tmp_stable_set;
CREATE TEMP TABLE tmp_stable_set AS
SELECT symbol,horizon,side,min_mentions,pos_thresh
FROM (
  SELECT
    symbol,horizon,side,min_mentions,pos_thresh,
    MIN(CASE WHEN fold='train' THEN sharpe END) AS train_sharpe,
    MIN(CASE WHEN fold='valid' THEN sharpe END) AS valid_sharpe
  FROM tmp_fold_agg
  GROUP BY 1,2,3,4,5
) s
WHERE (:'REQUIRE_STABLE')::int = 0
   OR (
        COALESCE(train_sharpe, -999) >= (:'MIN_SHARPE')::numeric
    AND COALESCE(valid_sharpe, -999) >= (:'MIN_SHARPE')::numeric * (:'SHARPE_FRAC')::numeric
      );

-- Optional rank consistency within each fold
DROP TABLE IF EXISTS tmp_consistent_set;
CREATE TEMP TABLE tmp_consistent_set AS
WITH ranks AS (
  SELECT *, RANK() OVER (PARTITION BY fold,symbol,horizon,side ORDER BY sharpe DESC NULLS LAST) AS rk
  FROM tmp_fold_agg
)
SELECT symbol,horizon,side,min_mentions,pos_thresh
FROM (
  SELECT symbol,horizon,side,min_mentions,pos_thresh,
         MAX(CASE WHEN fold='train' THEN rk END) AS r_train,
         MAX(CASE WHEN fold='valid' THEN rk END) AS r_valid
  FROM ranks
  GROUP BY 1,2,3,4,5
) q
WHERE (:'REQUIRE_RANK_CONSISTENT')::int = 0
   OR (
        COALESCE(r_train, 999) <= (:'RANK_TOP_K')::int
    AND COALESCE(r_valid, 999) <= (:'RANK_TOP_K')::int
      );

-- Apply stability filters to results (if required)
DROP TABLE IF EXISTS tmp_results_filtered;
CREATE TEMP TABLE tmp_results_filtered AS
SELECT r.*
FROM tmp_results r
JOIN tmp_stable_set s USING (symbol,horizon,side,min_mentions,pos_thresh)
JOIN tmp_consistent_set c USING (symbol,horizon,side,min_mentions,pos_thresh);

-- Switch view depending on flags
DROP TABLE IF EXISTS tmp_results_final;
CREATE TEMP TABLE tmp_results_final AS
SELECT * FROM (
  SELECT * FROM tmp_results WHERE (:'REQUIRE_STABLE')::int = 0 AND (:'REQUIRE_RANK_CONSISTENT')::int = 0
  UNION ALL
  SELECT * FROM tmp_results_filtered WHERE (:'REQUIRE_STABLE')::int = 1 OR (:'REQUIRE_RANK_CONSISTENT')::int = 1
) u;

-- ================================
-- 11) Baseline uplift (optional gating)
-- ================================
-- Naive baseline: go with the sign of avg_raw; LONG if avg_raw>0, SHORT if avg_raw<0
DROP TABLE IF EXISTS tmp_baseline_sig_start;
CREATE TEMP TABLE tmp_baseline_sig_start AS
SELECT
  c.symbol,
  g.horizon,
  CASE WHEN c.avg_raw >= 0 THEN 'LONG' ELSE 'SHORT' END AS side,
  CASE WHEN c.avg_raw >= 0 THEN 1 ELSE -1 END AS dir,
  c.d AS start_day,
  CASE g.horizon WHEN '1d' THEN 1 WHEN '3d' THEN 3 WHEN '5d' THEN 5 END AS hold_days
FROM tmp_candidates c
JOIN (SELECT DISTINCT horizon FROM tmp_grid) g ON TRUE
WHERE CASE g.horizon WHEN '1d' THEN 1 WHEN '3d' THEN 3 WHEN '5d' THEN 5 END IS NOT NULL;

DROP TABLE IF EXISTS tmp_baseline_fwd;
CREATE TEMP TABLE tmp_baseline_fwd AS
SELECT
  s.symbol, s.horizon, s.side, s.dir, s.start_day, s.hold_days,
  p.close AS entry_close,
  CASE s.hold_days
    WHEN 1 THEN p.close_t1
    WHEN 3 THEN p.close_t3
    WHEN 5 THEN p.close_t5
  END AS exit_close,
  CASE s.hold_days
    WHEN 1 THEN s.dir * (p.close_t1 / NULLIF(p.close, 0) - 1.0)
    WHEN 3 THEN s.dir * (p.close_t3 / NULLIF(p.close, 0) - 1.0)
    WHEN 5 THEN s.dir * (p.close_t5 / NULLIF(p.close, 0) - 1.0)
  END AS fwd_ret
FROM tmp_baseline_sig_start s
JOIN tmp_px p ON p.symbol=s.symbol AND p.d=s.start_day
WHERE CASE s.hold_days
        WHEN 1 THEN p.close_t1
        WHEN 3 THEN p.close_t3
        WHEN 5 THEN p.close_t5
      END IS NOT NULL
  AND p.close IS NOT NULL
  AND p.close <> 0;

DROP TABLE IF EXISTS tmp_baseline_agg;
CREATE TEMP TABLE tmp_baseline_agg AS
SELECT symbol,horizon,side,
       COUNT(*)::int AS base_trades,
       AVG(fwd_ret)::numeric AS base_avg_ret
FROM tmp_baseline_fwd
GROUP BY 1,2,3;

-- Random baseline: deterministic shuffle per (symbol,horizon,side)
DROP TABLE IF EXISTS tmp_random_pool;
CREATE TEMP TABLE tmp_random_pool AS
WITH horizon_map AS (
  SELECT '1d'::text AS horizon, 1 AS hold_days UNION ALL
  SELECT '3d'::text AS horizon, 3 AS hold_days UNION ALL
  SELECT '5d'::text AS horizon, 5 AS hold_days
), side_map AS (
  SELECT 'LONG'::text AS side, 1 AS dir UNION ALL
  SELECT 'SHORT'::text AS side, -1 AS dir
)
SELECT
  p.symbol,
  h.horizon,
  s.side,
  p.d AS start_day,
  s.dir * CASE h.hold_days
            WHEN 1 THEN (p.close_t1 / NULLIF(p.close, 0) - 1.0)
            WHEN 3 THEN (p.close_t3 / NULLIF(p.close, 0) - 1.0)
            WHEN 5 THEN (p.close_t5 / NULLIF(p.close, 0) - 1.0)
          END AS fwd_ret
FROM tmp_px p
CROSS JOIN horizon_map h
CROSS JOIN side_map s
WHERE CASE h.hold_days
        WHEN 1 THEN p.close_t1
        WHEN 3 THEN p.close_t3
        WHEN 5 THEN p.close_t5
      END IS NOT NULL
  AND p.close IS NOT NULL
  AND p.close <> 0;

DROP TABLE IF EXISTS tmp_random_ranked;
CREATE TEMP TABLE tmp_random_ranked AS
SELECT
  rp.symbol,
  rp.horizon,
  rp.side,
  rp.start_day,
  rp.fwd_ret,
  ROW_NUMBER() OVER (
    PARTITION BY rp.symbol, rp.horizon, rp.side
    ORDER BY md5(rp.symbol || rp.horizon || rp.side || rp.start_day::text)
  ) AS rand_rank
FROM tmp_random_pool rp;

DROP TABLE IF EXISTS tmp_random_baseline;
CREATE TEMP TABLE tmp_random_baseline AS
SELECT
  rr.symbol,
  rr.horizon,
  rr.side,
  rr.fwd_ret
FROM tmp_random_ranked rr
JOIN tmp_baseline_agg b
  ON b.symbol  = rr.symbol
 AND b.horizon = rr.horizon
 AND b.side    = rr.side
WHERE rr.rand_rank <= COALESCE(b.base_trades, 0);

DROP TABLE IF EXISTS tmp_random_baseline_agg;
CREATE TEMP TABLE tmp_random_baseline_agg AS
SELECT
  symbol,
  horizon,
  side,
  COUNT(*)::int AS base_trades,
  AVG(fwd_ret)::numeric AS base_avg_ret
FROM tmp_random_baseline
GROUP BY 1,2,3;

-- Attach uplift to results
ALTER TABLE tmp_results_final
  ADD COLUMN baseline_naive_trades int,
  ADD COLUMN baseline_naive_avg_ret numeric,
  ADD COLUMN baseline_random_trades int,
  ADD COLUMN baseline_random_avg_ret numeric,
  ADD COLUMN uplift numeric,
  ADD COLUMN uplift_random numeric;

UPDATE tmp_results_final r
SET baseline_naive_trades   = b.base_trades,
    baseline_naive_avg_ret  = b.base_avg_ret,
    uplift                  = r.avg_ret - b.base_avg_ret
FROM tmp_baseline_agg b
WHERE b.symbol=r.symbol AND b.horizon=r.horizon AND b.side=r.side;

UPDATE tmp_results_final r
SET baseline_random_trades  = br.base_trades,
    baseline_random_avg_ret = br.base_avg_ret,
    uplift_random           = r.avg_ret - br.base_avg_ret
FROM tmp_random_baseline_agg br
WHERE br.symbol=r.symbol AND br.horizon=r.horizon AND br.side=r.side;

-- Apply uplift gating if requested
DROP TABLE IF EXISTS tmp_results_gated;
CREATE TEMP TABLE tmp_results_gated AS
SELECT * FROM tmp_results_final
WHERE ((:'REQUIRE_UPLIFT_POSITIVE')::int = 0 OR uplift > 0)
  AND ((:'REQUIRE_LB_POSITIVE')::int = 0 OR lb > 0);
\if :DEBUG
  SELECT 'tmp_results_n' AS label, COUNT(*) AS n FROM tmp_results;
  SELECT symbol, horizon, side, min_mentions, pos_thresh, trades, ROUND((avg_ret)::numeric,5) avg_ret,
         ROUND((win_rate)::numeric,3) win_rate, ROUND((sharpe)::numeric,3) sharpe
  FROM tmp_results
  ORDER BY sharpe DESC NULLS LAST, trades DESC
  LIMIT 25;
\endif

-- ================================
-- 9) Output
-- ================================
-- Overall summary (just to eyeball scale)
SELECT
  SUM(trades) AS n_trades,
  ROUND(AVG(avg_ret)::numeric, 6) AS avg_ret,
  ROUND(AVG(win_rate)::numeric, 3) AS win_rate,
  ROUND(AVG(sharpe)::numeric, 4) AS mean_sharpe
FROM tmp_results_gated;

-- Per-pocket grid
SELECT
  r.symbol, r.horizon, r.side, r.min_mentions, r.pos_thresh,
  CASE
    WHEN r.pos_thresh >= (:'BAND_STRONG')::numeric   THEN 'STRONG'
    WHEN r.pos_thresh >= (:'BAND_MODERATE')::numeric THEN 'MODERATE'
    WHEN r.pos_thresh >= (:'BAND_WEAK')::numeric     THEN 'WEAK'
    ELSE 'VERY_WEAK'
  END AS band,
  r.trades, r.avg_ret, r.median_ret, r.win_rate, r.stdev_ret, r.sharpe,
  r.lb,
  r.baseline_naive_trades,
  r.baseline_naive_avg_ret,
  r.baseline_random_trades,
  r.baseline_random_avg_ret,
  r.uplift,
  r.uplift_random,
  d.train_trades, d.valid_trades, d.train_sharpe, d.valid_sharpe,
  d.r_train_rank, d.r_valid_rank,
  r.start_date, r.end_date, r.model_version
FROM tmp_results_gated r
LEFT JOIN tmp_fold_diag d
  ON d.symbol=r.symbol AND d.horizon=r.horizon AND d.side=r.side
 AND d.min_mentions=r.min_mentions AND d.pos_thresh=r.pos_thresh
ORDER BY CASE WHEN (:'USE_LB_RANKING')::int=1 THEN r.lb END DESC NULLS LAST,
         r.sharpe DESC NULLS LAST, r.trades DESC, r.symbol, r.horizon, r.side;

\if :DO_PERSIST
-- =========================
-- PERSIST + BEST-OF OUTPUT
-- =========================

-- Ensure persistence tables carry baseline/uplift metrics for promotion/reporting
ALTER TABLE IF EXISTS backtest_sweep_results
  ADD COLUMN IF NOT EXISTS baseline_naive_trades int,
  ADD COLUMN IF NOT EXISTS baseline_naive_avg_ret numeric,
  ADD COLUMN IF NOT EXISTS baseline_random_trades int,
  ADD COLUMN IF NOT EXISTS baseline_random_avg_ret numeric,
  ADD COLUMN IF NOT EXISTS uplift numeric,
  ADD COLUMN IF NOT EXISTS uplift_random numeric;

ALTER TABLE IF EXISTS backtest_sweep_grid
  ADD COLUMN IF NOT EXISTS baseline_naive_trades int,
  ADD COLUMN IF NOT EXISTS baseline_naive_avg_ret numeric,
  ADD COLUMN IF NOT EXISTS baseline_random_trades int,
  ADD COLUMN IF NOT EXISTS baseline_random_avg_ret numeric,
  ADD COLUMN IF NOT EXISTS uplift numeric,
  ADD COLUMN IF NOT EXISTS uplift_random numeric;

-- 1) Filter + rank grid, pick ONE row per (symbol,horizon,side)
WITH filtered AS (
  SELECT *
  FROM tmp_results_gated
  WHERE trades >= :'MIN_TRADES'::int
    AND (:'MIN_SHARPE'::numeric IS NULL OR sharpe >= :'MIN_SHARPE'::numeric)
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY symbol, horizon, side
      ORDER BY CASE WHEN (:'USE_LB_RANKING')::int=1 THEN lb END DESC NULLS LAST,
               sharpe DESC NULLS LAST, trades DESC, avg_ret DESC
    ) AS rk
  FROM filtered
),
r_best AS (
  SELECT
    symbol, horizon, side,
    min_mentions, pos_thresh,
    trades, avg_ret, win_rate, sharpe,
    baseline_naive_trades, baseline_naive_avg_ret,
    baseline_random_trades, baseline_random_avg_ret,
    uplift, uplift_random
  FROM ranked
  WHERE rk = 1
),
med AS (
  SELECT
    r.symbol, r.horizon, r.side, r.min_mentions, r.pos_thresh,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY f.fwd_ret)::numeric AS median_ret,
    stddev_pop(f.fwd_ret)::numeric AS stdev_ret
  FROM r_best r
  JOIN tmp_fwd f
    ON f.symbol = r.symbol
   AND f.horizon = r.horizon
   AND f.side    = r.side
  GROUP BY 1,2,3,4,5
)
INSERT INTO backtest_sweep_results (
  model_version, symbol, horizon, side,
  start_date, end_date,
  trades, avg_ret, median_ret, win_rate, stdev_ret, sharpe,
  min_mentions, pos_thresh,
  baseline_naive_trades, baseline_naive_avg_ret,
  baseline_random_trades, baseline_random_avg_ret,
  uplift, uplift_random,
  use_weighted, created_at
)
SELECT
  :'MODEL_VERSION'::text,
  r.symbol, r.horizon, r.side,
  :'START_DATE'::date, :'END_DATE'::date,
  r.trades, r.avg_ret, m.median_ret, r.win_rate, m.stdev_ret, r.sharpe,
  r.min_mentions, r.pos_thresh,
  r.baseline_naive_trades, r.baseline_naive_avg_ret,
  r.baseline_random_trades, r.baseline_random_avg_ret,
  r.uplift, r.uplift_random,
  false, now()
FROM r_best r
LEFT JOIN med m
  ON m.symbol=r.symbol AND m.horizon=r.horizon AND m.side=r.side
 AND m.min_mentions=r.min_mentions AND m.pos_thresh=r.pos_thresh
ON CONFLICT (model_version, symbol, horizon, side, start_date, end_date)
DO UPDATE SET
  trades       = EXCLUDED.trades,
  avg_ret      = EXCLUDED.avg_ret,
  median_ret   = EXCLUDED.median_ret,
  win_rate     = EXCLUDED.win_rate,
  stdev_ret    = EXCLUDED.stdev_ret,
  sharpe       = EXCLUDED.sharpe,
  min_mentions = EXCLUDED.min_mentions,
  pos_thresh   = EXCLUDED.pos_thresh,
  baseline_naive_trades   = EXCLUDED.baseline_naive_trades,
  baseline_naive_avg_ret  = EXCLUDED.baseline_naive_avg_ret,
  baseline_random_trades  = EXCLUDED.baseline_random_trades,
  baseline_random_avg_ret = EXCLUDED.baseline_random_avg_ret,
  uplift       = EXCLUDED.uplift,
  uplift_random= EXCLUDED.uplift_random,
  use_weighted = EXCLUDED.use_weighted,
  created_at   = EXCLUDED.created_at;

\echo 'Persisted top-per-(symbol,horizon,side) into backtest_sweep_results.'
-- 2) Also print those winners
SELECT *
FROM (
  SELECT
    symbol, horizon, side, min_mentions, pos_thresh,
    trades, avg_ret, win_rate, sharpe,
    ROW_NUMBER() OVER (
      PARTITION BY symbol, horizon, side
      ORDER BY sharpe DESC NULLS LAST, trades DESC, avg_ret DESC
    ) AS rk
  FROM tmp_results_gated
  WHERE trades >= :'MIN_TRADES'::int
    AND (:'MIN_SHARPE'::numeric IS NULL OR sharpe >= :'MIN_SHARPE'::numeric)
) q
WHERE rk = 1
ORDER BY sharpe DESC NULLS LAST, trades DESC, symbol;

\endif

-- Set these when you run psql if you want a CSV:
--   -v EXPORT_CSV=1 -v CSV_PATH='/tmp/grid_2025-06-01_2025-09-12.csv'

\if :PERSIST_FULL_GRID
-- =========================
-- FULL-GRID PERSISTENCE (optional)
-- =========================
CREATE TABLE IF NOT EXISTS backtest_sweep_grid (
  model_version text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  symbol text NOT NULL,
  horizon text NOT NULL,
  side text NOT NULL,
  min_mentions int2 NOT NULL,
  pos_thresh numeric NOT NULL,
  trades int NOT NULL,
  avg_ret numeric,
  median_ret numeric,
  win_rate numeric,
  stdev_ret numeric,
  sharpe numeric,
  baseline_naive_trades int,
  baseline_naive_avg_ret numeric,
  baseline_random_trades int,
  baseline_random_avg_ret numeric,
  uplift numeric,
  uplift_random numeric,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT chk_bsg_trades_nonneg CHECK (trades >= 0),
  CONSTRAINT chk_bsg_win_rate_bounds CHECK (win_rate IS NULL OR (win_rate >= 0 AND win_rate <= 1)),
  CONSTRAINT chk_bsg_horizon CHECK (horizon IN ('1d','3d','5d')),
  CONSTRAINT chk_bsg_side CHECK (side IN ('LONG','SHORT')),
  CONSTRAINT chk_bsg_pos_thresh CHECK (pos_thresh >= 0 AND pos_thresh <= 1),
  CONSTRAINT chk_bsg_min_mentions CHECK (min_mentions >= 0),
  PRIMARY KEY (model_version,start_date,end_date,symbol,horizon,side,min_mentions,pos_thresh)
);
CREATE INDEX IF NOT EXISTS idx_bsg_model_window ON backtest_sweep_grid (model_version,start_date,end_date);
CREATE INDEX IF NOT EXISTS idx_bsg_group ON backtest_sweep_grid (symbol,horizon,side);
CREATE INDEX IF NOT EXISTS idx_bsg_thresholds ON backtest_sweep_grid (symbol,horizon,side,min_mentions,pos_thresh);

INSERT INTO backtest_sweep_grid (
  model_version,start_date,end_date,
  symbol,horizon,side,min_mentions,pos_thresh,
  trades,avg_ret,median_ret,win_rate,stdev_ret,sharpe,
  baseline_naive_trades,baseline_naive_avg_ret,
  baseline_random_trades,baseline_random_avg_ret,
  uplift,uplift_random
)
SELECT
  model_version,start_date,end_date,
  symbol,horizon,side,min_mentions,pos_thresh,
  trades,avg_ret,median_ret,win_rate,stdev_ret,sharpe,
  baseline_naive_trades,baseline_naive_avg_ret,
  baseline_random_trades,baseline_random_avg_ret,
  uplift,uplift_random
FROM tmp_results_final
ON CONFLICT (model_version,start_date,end_date,symbol,horizon,side,min_mentions,pos_thresh)
DO UPDATE SET
  trades     = EXCLUDED.trades,
  avg_ret    = EXCLUDED.avg_ret,
  median_ret = EXCLUDED.median_ret,
  win_rate   = EXCLUDED.win_rate,
  stdev_ret  = EXCLUDED.stdev_ret,
  sharpe     = EXCLUDED.sharpe,
  baseline_naive_trades   = EXCLUDED.baseline_naive_trades,
  baseline_naive_avg_ret  = EXCLUDED.baseline_naive_avg_ret,
  baseline_random_trades  = EXCLUDED.baseline_random_trades,
  baseline_random_avg_ret = EXCLUDED.baseline_random_avg_ret,
  uplift     = EXCLUDED.uplift,
  uplift_random = EXCLUDED.uplift_random,
  created_at = now();

ANALYZE backtest_sweep_grid;
\echo 'Persisted full grid into backtest_sweep_grid.'
\endif

\if :EXPORT_CSV
\echo 'Exporting full grid (tmp_results) to CSV...'
COPY (
  SELECT
    :'MODEL_VERSION'::text AS model_version,
    :'START_DATE'::date    AS start_date,
    :'END_DATE'::date      AS end_date,
    r.symbol, r.horizon, r.side, r.min_mentions, r.pos_thresh,
    CASE
      WHEN r.pos_thresh >= (:'BAND_STRONG')::numeric   THEN 'STRONG'
      WHEN r.pos_thresh >= (:'BAND_MODERATE')::numeric THEN 'MODERATE'
      WHEN r.pos_thresh >= (:'BAND_WEAK')::numeric     THEN 'WEAK'
      ELSE 'VERY_WEAK'
    END AS band,
    r.trades, r.avg_ret, r.median_ret, r.win_rate, r.stdev_ret, r.sharpe,
    d.train_trades, d.valid_trades, d.train_sharpe, d.valid_sharpe,
    d.r_train_rank, d.r_valid_rank
  FROM tmp_results r
  LEFT JOIN tmp_fold_diag d
    ON d.symbol=r.symbol AND d.horizon=r.horizon AND d.side=r.side
   AND d.min_mentions=r.min_mentions AND d.pos_thresh=r.pos_thresh
  ORDER BY r.symbol, r.horizon, r.side, r.min_mentions, r.pos_thresh
) TO STDOUT WITH (FORMAT csv, HEADER);
\g :CSV_PATH
\echo 'CSV written to ' :CSV_PATH
\endif

-- 2) Display “best per symbol/horizon/side” (no persistence; just output)
WITH filtered AS (
  SELECT *
  FROM tmp_results_gated
  WHERE trades >= :'MIN_TRADES'::int
    AND (:'MIN_SHARPE'::numeric IS NULL OR sharpe >= :'MIN_SHARPE'::numeric)
    AND sharpe IS NOT NULL
),
ranked AS (
  SELECT
    symbol, horizon, side, min_mentions, pos_thresh,
    trades, avg_ret, win_rate, sharpe, lb,
    ROW_NUMBER() OVER (
      PARTITION BY symbol, horizon, side
      ORDER BY sharpe DESC NULLS LAST, trades DESC
    ) AS rk
  FROM filtered
)
SELECT *
FROM ranked
WHERE rk = 1
ORDER BY CASE WHEN (:'USE_LB_RANKING')::int=1 THEN lb END DESC NULLS LAST,
         sharpe DESC NULLS LAST, trades DESC, symbol;
