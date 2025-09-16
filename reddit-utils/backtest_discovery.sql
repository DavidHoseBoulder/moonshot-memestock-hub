-- backtest_discovery.sql [moved to reddit-utils]
-- Unsupervised discovery of profitable sentiment pockets.
-- Variables (override via -v):
\if :{?MODEL_VERSION}     \else \set MODEL_VERSION    'gpt-sent-v1' \endif
\if :{?START_DATE}        \else \set START_DATE       '2025-08-01'  \endif
\if :{?END_DATE}          \else \set END_DATE         '2025-09-01'  \endif
\if :{?MIN_CONF}          \else \set MIN_CONF         0.70          \endif
\if :{?MIN_MENTIONS_REQ}  \else \set MIN_MENTIONS_REQ 3             \endif
\if :{?POS_RATE_MIN}      \else \set POS_RATE_MIN     0.55          \endif
\if :{?AVG_ABS_MIN}       \else \set AVG_ABS_MIN      0.10          \endif
\if :{?DO_PERSIST}        \else \set DO_PERSIST       0             \endif
-- (optional) change thresholds / horizons here as needed
-- Threshold grid is 0.05–0.30; horizons are 1d/3d/5d.

-- 1) Scored mentions in window
DROP TABLE IF EXISTS tmp_scored;
CREATE TEMP TABLE tmp_scored AS
SELECT
  upper(m.symbol)         AS symbol,
  m.created_utc::date     AS d,
  s.overall_score::float8 AS score,
  s.confidence::float8    AS conf
FROM reddit_mentions m
JOIN reddit_sentiment s ON s.mention_id = m.mention_id
WHERE s.model_version = :'MODEL_VERSION'
  AND m.doc_type IN ('post','comment')
  AND m.created_utc::date >= DATE :'START_DATE'
  AND m.created_utc::date <  DATE :'END_DATE'
  AND s.confidence >= :'MIN_CONF';

-- 2) Daily aggregates
DROP TABLE IF EXISTS tmp_daily;
CREATE TEMP TABLE tmp_daily AS
SELECT
  symbol,
  d,
  COUNT(*)                        AS mentions,
  AVG(score)                      AS avg_raw,
  AVG(ABS(score))                 AS avg_abs,
  AVG((score > 0)::int)::numeric  AS pos_rate,
  AVG((score < 0)::int)::numeric  AS neg_rate
FROM tmp_scored
GROUP BY 1,2;

-- 3) Candidate days passing gates
DROP TABLE IF EXISTS tmp_candidates;
CREATE TEMP TABLE tmp_candidates AS
SELECT *
FROM tmp_daily
WHERE mentions >= COALESCE(NULLIF(NULLIF(:'MIN_MENTIONS_REQ','NULL'), '')::int, 0)
  AND avg_abs >= :'AVG_ABS_MIN'
  AND (pos_rate >= :'POS_RATE_MIN' OR neg_rate >= :'POS_RATE_MIN');

-- 4) Grid: horizons × thresholds
DROP TABLE IF EXISTS tmp_grid;
CREATE TEMP TABLE tmp_grid AS
SELECT h.h, t.t
FROM (VALUES ('1d'),('3d'),('5d')) AS h(h)
CROSS JOIN (VALUES (0.05),(0.10),(0.15),(0.20),(0.25),(0.30)) AS t(t);

-- 5) Signal starts (side inferred from sign of avg_raw against pos_thresh)
DROP TABLE IF EXISTS tmp_sig_start;
CREATE TEMP TABLE tmp_sig_start AS
SELECT
  c.symbol,
  c.d AS start_day,
  CASE WHEN c.avg_raw >=  g.t THEN 'LONG'
       WHEN c.avg_raw <= -g.t THEN 'SHORT'
  END AS side,
  CASE WHEN c.avg_raw >=  g.t THEN  1 ELSE -1 END AS dir,
  g.h AS horizon,
  CASE g.h WHEN '1d' THEN 1 WHEN '3d' THEN 3 WHEN '5d' THEN 5 END AS hold_days,
  g.t AS pos_thresh
FROM tmp_candidates c
JOIN tmp_grid g ON TRUE
WHERE (c.avg_raw >=  g.t OR c.avg_raw <= -g.t);

-- 6) Prices with forward closes
DROP TABLE IF EXISTS tmp_px;
CREATE TEMP TABLE tmp_px AS
SELECT
  upper(symbol) AS symbol,
  data_date::date AS d,
  price_close::float8 AS close,
  lead(price_close, 1) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t1,
  lead(price_close, 3) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t3,
  lead(price_close, 5) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t5
FROM enhanced_market_data;

-- 7) Forward returns
DROP TABLE IF EXISTS tmp_fwd;
CREATE TEMP TABLE tmp_fwd AS
SELECT
  ss.symbol, ss.horizon, ss.side, ss.dir, ss.pos_thresh,
  ss.start_day, ss.hold_days,
  p.close AS entry_close,
  CASE ss.hold_days
    WHEN 1 THEN p.close_t1
    WHEN 3 THEN p.close_t3
    WHEN 5 THEN p.close_t5
  END AS exit_close,
  CASE ss.hold_days
    WHEN 1 THEN ss.dir * (p.close_t1/p.close - 1.0)
    WHEN 3 THEN ss.dir * (p.close_t3/p.close - 1.0)
    WHEN 5 THEN ss.dir * (p.close_t5/p.close - 1.0)
  END AS fwd_ret
FROM tmp_sig_start ss
JOIN tmp_px p
  ON p.symbol = ss.symbol
 AND p.d      = ss.start_day
WHERE CASE ss.hold_days
        WHEN 1 THEN p.close_t1
        WHEN 3 THEN p.close_t3
        WHEN 5 THEN p.close_t5
      END IS NOT NULL;

-- 8) Overall sanity
SELECT
  COUNT(*)::int AS n_trades,
  ROUND(AVG(fwd_ret)::numeric,4) AS avg_ret,
  ROUND(AVG((fwd_ret>0)::int)::numeric,3) AS win_rate,
  ROUND((
    CASE WHEN COUNT(*)>1 AND stddev_pop(fwd_ret)>0
         THEN (AVG(fwd_ret)/stddev_pop(fwd_ret))::numeric
         ELSE NULL END
  ),4) AS sharpe
FROM tmp_fwd;

-- 9) Top pockets (report)
SELECT
  symbol, horizon, side, pos_thresh,
  COUNT(*) AS n_trades,
  ROUND(AVG(fwd_ret)::numeric,4) AS avg_ret,
  ROUND(AVG((fwd_ret>0)::int)::numeric,3) AS win_rate,
  ROUND((
    CASE WHEN COUNT(*)>1 AND stddev_pop(fwd_ret)>0
         THEN (AVG(fwd_ret)/stddev_pop(fwd_ret))::numeric
         ELSE NULL END
  ),4) AS sharpe
FROM tmp_fwd
GROUP BY symbol, horizon, side, pos_thresh
HAVING COUNT(*) >= 15
ORDER BY sharpe DESC NULLS LAST, n_trades DESC, symbol
LIMIT 40;

-- 10) Optional: persist pockets to backtest_sweep_results
--     Toggle with: -v DO_PERSIST=1
\if :{?DO_PERSIST}
\if :DO_PERSIST

-- Per-pocket metrics including median & stdev
DROP TABLE IF EXISTS tmp_persist;
CREATE TEMP TABLE tmp_persist AS
SELECT
  f.symbol,
  f.horizon,
  f.side,
  f.pos_thresh,
  COUNT(*)::int                                                        AS trades,
  AVG(fwd_ret)::numeric                                                AS avg_ret,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fwd_ret)::numeric        AS median_ret,
  AVG((fwd_ret>0)::int)::numeric                                      AS win_rate,
  stddev_pop(fwd_ret)::numeric                                         AS stdev_ret,
  (CASE WHEN COUNT(*)>1 AND stddev_pop(fwd_ret)>0
        THEN (AVG(fwd_ret)/stddev_pop(fwd_ret))::numeric
        ELSE NULL END)                                                AS sharpe
FROM tmp_fwd f
GROUP BY 1,2,3,4;

INSERT INTO backtest_sweep_results (
  model_version, symbol, horizon, side,
  start_date, end_date,
  trades, avg_ret, median_ret, win_rate, stdev_ret, sharpe,
  min_mentions, pos_thresh, use_weighted, created_at
)
SELECT
  :'MODEL_VERSION'::text,
  p.symbol, p.horizon, p.side,
  :'START_DATE'::date, :'END_DATE'::date,
  p.trades, p.avg_ret, p.median_ret, p.win_rate, p.stdev_ret, p.sharpe,
  NULLIF(NULLIF(:'MIN_MENTIONS_REQ','NULL'),'')::int,
  p.pos_thresh,
  FALSE,
  now()
FROM tmp_persist p
WHERE p.trades >= 1
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
  use_weighted = EXCLUDED.use_weighted,
  created_at   = EXCLUDED.created_at;

\endif
\endif
