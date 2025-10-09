-- ============================================================================
-- Proposal & Refactor Summary (Performance-Focused)
-- ----------------------------------------------------------------------------
-- Key bottlenecks fixed
-- - Avoided date casts on columns (m.created_utc::date) that prevented index use.
-- - Removed row explosion by aggregating once per (symbol, day, min_conf) instead of
--   joining mentions directly to every rule. Rules are joined after aggregation.
-- - Eliminated duplicate full-table price builds; price table now builds only when
--   signals exist and only for required symbols and dates.
-- - Reduced repeated per-row function calls (UPPER/ANY) by normalizing early and
--   using small helper temp tables where helpful.
-- - Added lightweight temp indexes and ANALYZE to help the planner.
-- - Removed unused work (tmp_scored) and gated preview sorts behind DEBUG.
--
-- Concrete changes
-- 1) Rules: Normalize symbols once; keep enabled side (no mirroring). Keep per-rule
--    min_conf with model fallback. Add tmp_rules_sided with dir.
-- 2) Distinct confidences: Build tmp_conf with distinct min_conf values across rules.
-- 3) Daily sentiment: Build tmp_daily_sent by grouping reddit mentions per
--    (symbol, day) and computing metrics for all distinct min_conf thresholds using
--    FILTER clauses. No join to rules at the row level.
-- 4) Aggregate join: Build tmp_agg by joining tmp_daily_sent to tmp_rules_sided on
--    (symbol, min_conf) and then apply side/horizon logic and gating.
-- 5) Prices: Build tmp_px only when signals exist and restrict to
--    symbols/dates needed for exits. Add temp indexes + ANALYZE.
-- 6) Debug: Gate preview SELECTs behind DEBUG; removed tmp_scored and related prints.
--
-- Index recommendations (on base tables)
-- - reddit_sentiment: CREATE INDEX ON reddit_sentiment(mention_id, model_version);
-- - reddit_mentions: CREATE INDEX ON reddit_mentions(symbol, created_utc)
--   WHERE doc_type IN ('post','comment');
--   or a functional index if symbols aren’t normalized:
--   CREATE INDEX ON reddit_mentions(upper(symbol), created_utc)
--   WHERE doc_type IN ('post','comment');
-- - enhanced_market_data: CREATE INDEX ON enhanced_market_data(symbol, data_date);
--
-- Why faster
-- - Single-pass aggregation per day/threshold avoids O(rows × rules_per_symbol)
--   blowups. Timestamp comparisons preserve index usage. Price data is built only
--   for what’s needed. Temp indexes + ANALYZE improve join orders and estimates.
-- ============================================================================

-- backtest_enabled_rules.sql (refactored, TEMP-table version)
-- Backtests ENABLED LONG & SHORT rules in live_sentiment_entry_rules over a date
-- window using reddit_mentions + reddit_sentiment and enhanced_market_data.

-- Vars (override via -v)
\if :{?MODEL_VERSION} \else \set MODEL_VERSION  'gpt-sent-v1' \endif
\if :{?START_DATE}    \else \set START_DATE     '2025-08-01'  \endif
\if :{?END_DATE}      \else \set END_DATE       '2025-09-01'  \endif
\if :{?MIN_CONF}      \else \set MIN_CONF       0.70          \endif
\if :{?TP_PCT}        \else \set TP_PCT         0             \endif
\if :{?DEBUG}         \else \set DEBUG          FALSE         \endif
\if :{?POS_RATE_MIN}     \else \set POS_RATE_MIN     0.00 \endif
\if :{?AVG_ABS_MIN}      \else \set AVG_ABS_MIN      0.00 \endif
\if :{?MIN_MENTIONS_REQ} \else \set MIN_MENTIONS_REQ NULL \endif
\if :{?SYNTH_IF_EMPTY}   \else \set SYNTH_IF_EMPTY 0 \endif
-- (SYMBOLS is a comma-separated list, or NULL for all)
\if :{?SYMBOLS}       \else \set SYMBOLS        NULL          \endif

-- 1) Enabled rules to test (no side mirroring)
DROP TABLE IF EXISTS tmp_rules;
CREATE TEMP TABLE tmp_rules AS
SELECT
  upper(symbol)                   AS symbol,
  horizon,
  side,                           -- honor the enabled side; do NOT mirror
  GREATEST(1, min_mentions)::int  AS min_mentions,   -- safety clamp
  pos_thresh::numeric             AS pos_thresh,
  COALESCE(min_conf, :'MIN_CONF')::numeric AS min_conf, -- per-rule min_conf with fallback
  COALESCE(use_weighted, false)   AS use_weighted,
  model_version
FROM live_sentiment_entry_rules
WHERE is_enabled = true
  AND model_version = :'MODEL_VERSION'
  AND (
        :'SYMBOLS' IS NULL
        OR upper(symbol) = ANY (string_to_array(upper(:'SYMBOLS'), ','))
      );

-- Active model config (min_conf fallback)
DROP TABLE IF EXISTS tmp_model_cfg;
CREATE TEMP TABLE tmp_model_cfg AS
SELECT (min_confidence_score::numeric / 100.0) AS min_conf
FROM reddit_heuristics
WHERE is_active = true
  AND model_version = :'MODEL_VERSION'
ORDER BY effective_at DESC
LIMIT 1;

-- Ensure one row exists (hard fallback 0.70)
INSERT INTO tmp_model_cfg (min_conf)
SELECT 0.70
WHERE NOT EXISTS (SELECT 1 FROM tmp_model_cfg);

-- Optional synthesis of defaults if no enabled rules but symbols provided
\if :{?SYNTH_IF_EMPTY} \else \set SYNTH_IF_EMPTY 0 \endif
WITH need AS (
  SELECT
    (SELECT COUNT(*) FROM tmp_rules) = 0
    AND NULLIF(:'SYNTH_IF_EMPTY','0') IS NOT NULL
    AND (:'SYMBOLS' IS NOT NULL AND :'SYMBOLS' <> '') AS do_it
)
INSERT INTO tmp_rules (model_version, symbol, horizon, side, min_mentions, pos_thresh, use_weighted, min_conf)
SELECT
  :'MODEL_VERSION',
  t.sym,
  h AS horizon,
  'LONG' AS side,
  3                       AS min_mentions,
  0.20                    AS pos_thresh,
  false                   AS use_weighted,
  COALESCE(
    NULLIF(:'MIN_CONF','')::numeric,         -- 1) explicit override
    (SELECT min_conf FROM tmp_model_cfg),    -- 2) active reddit_heuristics
    0.70                                     -- 3) hard fallback
  )                      AS min_conf
FROM need
JOIN (SELECT trim(s) AS sym
      FROM unnest(string_to_array(upper(:'SYMBOLS'), ',')) AS s) t ON TRUE
CROSS JOIN (VALUES ('1d'),('3d'),('5d')) AS horizons(h)
WHERE (SELECT do_it FROM need);

-- Sided rules (dir)
DROP TABLE IF EXISTS tmp_rules_sided;
CREATE TEMP TABLE tmp_rules_sided AS
SELECT
  model_version,
  symbol,
  horizon,
  side,
  CASE side WHEN 'LONG' THEN  1 ELSE -1 END AS dir,
  min_mentions,
  pos_thresh,
  COALESCE(min_conf, 0.70)::numeric AS min_conf,
  use_weighted
FROM tmp_rules;

-- Distinct confidence thresholds used by rules
DROP TABLE IF EXISTS tmp_conf;
CREATE TEMP TABLE tmp_conf AS
SELECT DISTINCT min_conf::numeric AS min_conf
FROM tmp_rules_sided;

CREATE INDEX ON tmp_rules_sided(symbol, min_conf);
ANALYZE tmp_rules_sided;
ANALYZE tmp_conf;

\if :DEBUG
  SELECT 'rules' AS label, COUNT(*) AS n FROM tmp_rules;
  SELECT 'rules_sided' AS label, COUNT(*) AS n FROM tmp_rules_sided;
\endif

-- 2) Daily base sentiment (per symbol/day/min_conf) honoring per-rule min_conf
--    Single pass over mentions; compute thresholded metrics with FILTER
DROP TABLE IF EXISTS tmp_daily_sent;
CREATE TEMP TABLE tmp_daily_sent AS
WITH base AS (
  SELECT
    upper(m.symbol)                               AS symbol,
    m.created_utc::date                           AS d,
    COALESCE(s.overall_score, s.score)::numeric   AS score,
    s.confidence::numeric                         AS conf
  FROM reddit_mentions m
  JOIN reddit_sentiment s
    ON s.mention_id = m.mention_id
   AND s.model_version = :'MODEL_VERSION'
  WHERE m.created_utc >= :'START_DATE'::date
    AND m.created_utc <  :'END_DATE'::date
    AND m.doc_type IN ('post','comment')
    AND m.symbol IS NOT NULL AND m.symbol <> ''
    AND (
          :'SYMBOLS' IS NULL
          OR upper(m.symbol) = ANY (string_to_array(upper(:'SYMBOLS'), ','))
        )
)
SELECT
  b.symbol,
  b.d,
  c.min_conf,
 SUM(CASE WHEN b.conf >= c.min_conf THEN 1 ELSE 0 END) AS mentions,
 AVG(CASE WHEN b.conf >= c.min_conf THEN b.score END) AS avg_raw,
 AVG(CASE WHEN b.conf >= c.min_conf THEN ABS(b.score) END) AS avg_abs,
 AVG(CASE WHEN b.conf >= c.min_conf THEN (b.score > 0)::int END)::numeric AS pos_rate,
 AVG(CASE WHEN b.conf >= c.min_conf THEN (b.score < 0)::int END)::numeric AS neg_rate,
 AVG(CASE WHEN b.conf >= c.min_conf THEN SIGN(b.score) END)::numeric AS avg_sign,
 (
   SUM(CASE WHEN b.conf >= c.min_conf THEN b.score * b.conf END)
   /
   NULLIF(SUM(CASE WHEN b.conf >= c.min_conf THEN b.conf END), 0)
 )::numeric AS avg_w,
 percentile_cont(0.5) WITHIN GROUP (ORDER BY b.score) FILTER (WHERE b.conf >= c.min_conf)::numeric AS median_score,
 ROUND(AVG(CASE WHEN b.conf >= c.min_conf THEN b.score END), 2) AS avg_score
FROM base b
CROSS JOIN tmp_conf c
GROUP BY b.symbol, b.d, c.min_conf;

CREATE INDEX ON tmp_daily_sent(symbol, d, min_conf);
ANALYZE tmp_daily_sent;

-- 3) Daily aggregation per rule (+ side) applying per-rule AND soft global floors
DROP TABLE IF EXISTS tmp_agg;
CREATE TEMP TABLE tmp_agg AS
SELECT
  r.symbol, r.horizon, r.side, r.dir, r.min_conf,
  -- effective min_mentions (respect MIN_MENTIONS_REQ; safely cast after NULLIFs)
  GREATEST(
    1,
    LEAST(
      r.min_mentions,
      COALESCE(NULLIF(NULLIF(:'MIN_MENTIONS_REQ','NULL'), '')::int, r.min_mentions)
    )
  ) AS min_mentions,
  ds.d,
  COALESCE(ds.mentions,0)::int   AS mentions,
  ds.avg_raw, ds.avg_abs, ds.pos_rate, ds.neg_rate,
  (COALESCE(ds.pos_rate,0) - COALESCE(ds.neg_rate,0)) AS net_pos,
  ds.avg_sign, ds.avg_w, ds.median_score,
  ds.avg_score,                                 -- debug convenience

  -- keep the rule threshold in the row
  r.pos_thresh,

  -- enough_mentions flag using the same safe MIN_MENTIONS_REQ logic
  (
    COALESCE(ds.mentions,0) >= GREATEST(
      1,
      COALESCE(
        LEAST(
          r.min_mentions,
          NULLIF(NULLIF(:'MIN_MENTIONS_REQ','NULL'), '')::int
        ),
        r.min_mentions
      )
    )
  ) AS enough_mentions,

  -- quality guardrails
  (
    (CASE
       WHEN r.dir =  1 THEN COALESCE(ds.pos_rate,0) >= COALESCE(NULLIF(:'POS_RATE_MIN','')::numeric, 0)
       WHEN r.dir = -1 THEN COALESCE(ds.neg_rate,0) >= COALESCE(NULLIF(:'POS_RATE_MIN','')::numeric, 0)
     END)
    AND COALESCE(ds.avg_abs,0) >= COALESCE(NULLIF(:'AVG_ABS_MIN','')::numeric, 0)
    AND COALESCE(ds.mentions,0) > 0
  ) AS quality_ok,

  -- side-aware threshold on avg_raw
  CASE
    WHEN r.dir =  1 THEN (ds.avg_raw IS NOT NULL AND ds.avg_raw >=  r.pos_thresh)
    WHEN r.dir = -1 THEN (ds.avg_raw IS NOT NULL AND ds.avg_raw <= -r.pos_thresh)
    ELSE FALSE
  END AS pass_thresh_raw

FROM tmp_rules_sided r
LEFT JOIN tmp_daily_sent ds
  ON ds.symbol   = r.symbol
 AND ds.min_conf = r.min_conf;

ANALYZE tmp_agg;

\if :DEBUG
  SELECT
    symbol, d, horizon, side, mentions,
    avg_score,                -- preview
    avg_raw, avg_abs, pos_rate, neg_rate, net_pos, avg_sign, avg_w, median_score,
    min_mentions, pos_thresh, enough_mentions, pass_thresh_raw
  FROM tmp_agg
  ORDER BY symbol, d, horizon, side
  LIMIT 200;

  SELECT
    symbol, d, min_conf, mentions, avg_raw, avg_abs, pos_rate, avg_sign
  FROM tmp_daily_sent
  ORDER BY d DESC, symbol
  LIMIT 50;
\endif

-- 4) Signal starts (side-aware)
DROP TABLE IF EXISTS tmp_sig_start;
CREATE TEMP TABLE tmp_sig_start AS
SELECT
  a.symbol, a.horizon, a.side, a.dir, a.min_conf,
  a.d AS start_day,
  CASE a.horizon WHEN '1d' THEN 1 WHEN '3d' THEN 3 WHEN '5d' THEN 5 END AS hold_days
FROM tmp_agg a
WHERE a.mentions >= a.min_mentions
  AND a.quality_ok
  AND (
        (a.side='LONG'  AND a.avg_raw >=  a.pos_thresh)
     OR (a.side='SHORT' AND a.avg_raw <= -a.pos_thresh)
      );

\if :DEBUG
  SELECT 'signals' AS label, COUNT(*) AS n FROM tmp_sig_start;
\endif

-- 5) Forward returns (guard everything if no signals)
DO $$
BEGIN
  -- Always drop temp outputs first to avoid "already exists" on re-runs
  DROP TABLE IF EXISTS tmp_px;
  DROP TABLE IF EXISTS tmp_fwd;
  DROP TABLE IF EXISTS tmp_per_symbol;
  DROP TABLE IF EXISTS tmp_overall;

  IF EXISTS (SELECT 1 FROM tmp_sig_start) THEN
    -- Build tmp_px only for needed symbols and date range
    CREATE TEMP TABLE tmp_px AS
    SELECT
      upper(symbol) AS symbol,
      data_date::date AS d,
      price_close::float8 AS close,
      lead(price_close, 1) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t1,
      lead(price_close, 3) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t3,
      lead(price_close, 5) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t5
    FROM enhanced_market_data
    WHERE upper(symbol) IN (SELECT DISTINCT symbol FROM tmp_sig_start)
      AND data_date >= (SELECT min(start_day) FROM tmp_sig_start)
      AND data_date <= (SELECT max(start_day) + 5 FROM tmp_sig_start);

    CREATE INDEX ON tmp_sig_start(symbol, start_day);
    CREATE INDEX ON tmp_px(symbol, d);
    ANALYZE tmp_px;

    CREATE TEMP TABLE tmp_fwd AS
    SELECT
      ss.symbol, ss.horizon, ss.side, ss.dir,
      ss.start_day, ss.hold_days,
      p.close AS entry_close,
      CASE ss.hold_days
        WHEN 1 THEN p.close_t1
        WHEN 3 THEN p.close_t3
        WHEN 5 THEN p.close_t5
      END AS exit_close,
      CASE ss.hold_days
        WHEN 1 THEN ss.dir * (p.close_t1 / p.close - 1.0)
        WHEN 3 THEN ss.dir * (p.close_t3 / p.close - 1.0)
        WHEN 5 THEN ss.dir * (p.close_t5 / p.close - 1.0)
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

    CREATE TEMP TABLE tmp_per_symbol AS
    SELECT
      symbol, horizon, side,
      COUNT(*)::int        AS n_trades,
      AVG(fwd_ret)::float8 AS avg_ret,
      SUM(fwd_ret)::float8 AS total_ret,
      AVG((fwd_ret > 0)::int)::numeric AS win_rate,
      CASE WHEN COUNT(*) > 1 THEN stddev_pop(fwd_ret)::float8 ELSE 0.0 END AS vol,
      ROUND( (CASE WHEN COUNT(*)>1 AND stddev_pop(fwd_ret)>0
                  THEN (avg(fwd_ret)/stddev_pop(fwd_ret))::numeric
                  ELSE NULL
             END)::numeric, 4) AS sharpe
    FROM tmp_fwd
    WHERE fwd_ret IS NOT NULL
    GROUP BY symbol, horizon, side;

    CREATE TEMP TABLE tmp_overall AS
    SELECT
      COUNT(*)::int        AS n_trades,
      AVG(fwd_ret)::float8 AS avg_ret,
      SUM(fwd_ret)::float8 AS total_ret,
      AVG((fwd_ret > 0)::int)::numeric AS win_rate,
      CASE WHEN COUNT(*) > 1 THEN stddev_pop(fwd_ret)::float8 ELSE 0.0 END AS vol,
      ROUND((
        CASE WHEN COUNT(*) > 1 AND stddev_pop(fwd_ret) > 0
             THEN (AVG(fwd_ret)/stddev_pop(fwd_ret))::numeric
             ELSE NULL
        END
      )::numeric, 4) AS sharpe
    FROM tmp_fwd
    WHERE fwd_ret IS NOT NULL;

  ELSE
    -- create empty shells so later SELECTs won't error
    DROP TABLE IF EXISTS tmp_fwd;
    DROP TABLE IF EXISTS tmp_per_symbol;
    DROP TABLE IF EXISTS tmp_overall;

    CREATE TEMP TABLE tmp_fwd(
      symbol text, horizon text, side text, dir int,
      start_day date, hold_days int,
      entry_close float8, exit_close float8, fwd_ret float8
    );
    CREATE TEMP TABLE tmp_per_symbol(
      symbol text, horizon text, side text,
      n_trades int, avg_ret float8, total_ret float8,
      win_rate numeric, vol float8, sharpe numeric
    );
    CREATE TEMP TABLE tmp_overall(
      n_trades int, avg_ret float8, total_ret float8,
      win_rate numeric, vol float8, sharpe numeric
    );
  END IF;
END$$;

-- 6) Persist tmp_fwd summary for validation or downstream use
DROP TABLE IF EXISTS tmp_trades;
CREATE TABLE tmp_trades AS
SELECT
  symbol,
  horizon,
  start_day,
  fwd_ret
FROM tmp_fwd;

-- 7) Output
SELECT
  'Backtest window' AS label,
  :'START_DATE'::text AS start_date,
  :'END_DATE'::text   AS end_date,
  :'MODEL_VERSION'::text AS model_version,
  :'MIN_CONF'::text   AS min_conf;

SELECT * FROM tmp_overall;

SELECT
  symbol, horizon, side, n_trades, avg_ret, total_ret, win_rate, vol, sharpe
FROM tmp_per_symbol
ORDER BY side, sharpe DESC NULLS LAST, n_trades DESC, symbol ASC;

-- Persist per-pocket results (both sides)
INSERT INTO backtest_sweep_results (
  model_version, symbol, horizon, side,
  start_date, end_date,
  trades, avg_ret, median_ret, win_rate, sharpe,
  min_mentions, pos_thresh, use_weighted, created_at
)
SELECT
  :'MODEL_VERSION'::text,
  p.symbol, p.horizon, p.side,
  :'START_DATE'::date, :'END_DATE'::date,
  p.n_trades,
  p.avg_ret,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.fwd_ret) AS median_ret,
  p.win_rate,
  p.sharpe,
  MIN(r.min_mentions) AS min_mentions,
  MIN(r.pos_thresh)   AS pos_thresh,
  FALSE               AS use_weighted,            -- hardcode since rules lack it
  now()
FROM tmp_per_symbol p
JOIN tmp_fwd f
  ON f.symbol=p.symbol AND f.horizon=p.horizon AND f.side=p.side
JOIN tmp_rules_sided r
  ON r.symbol=p.symbol AND r.horizon=p.horizon AND r.side=p.side
GROUP BY 1,2,3,4,5,6,7,8,10,11
ON CONFLICT (model_version, symbol, horizon, side, start_date, end_date)
DO UPDATE SET
  trades       = EXCLUDED.trades,
  avg_ret      = EXCLUDED.avg_ret,
  median_ret   = EXCLUDED.median_ret,
  win_rate     = EXCLUDED.win_rate,
  sharpe       = EXCLUDED.sharpe,
  min_mentions = EXCLUDED.min_mentions,
  pos_thresh   = EXCLUDED.pos_thresh,
  use_weighted = EXCLUDED.use_weighted,
  created_at   = EXCLUDED.created_at;

\if :DEBUG
-- Debugging previews
SELECT
  a.symbol, a.d, a.horizon, a.side, a.mentions,
  a.avg_raw, a.avg_abs, a.pos_rate, a.neg_rate, a.net_pos, a.avg_sign,
  r.min_mentions, r.pos_thresh,
  a.enough_mentions, a.quality_ok,
  a.pass_thresh_raw,
  CASE
    WHEN a.side = 'LONG'  THEN a.avg_raw >=  r.pos_thresh
    WHEN a.side = 'SHORT' THEN a.avg_raw <= -r.pos_thresh
  END AS pass_avg_raw_check,
  CASE
    WHEN a.side = 'LONG'  THEN a.avg_sign >=  r.pos_thresh
    WHEN a.side = 'SHORT' THEN (-a.avg_sign) >= r.pos_thresh
  END AS pass_sign_check
FROM tmp_agg a
JOIN tmp_rules_sided r USING (symbol, horizon, side)
WHERE (:'SYMBOLS' IS NULL
      OR a.symbol = ANY (string_to_array(upper(:'SYMBOLS'), ',')))
ORDER BY a.symbol, a.d, a.horizon, a.side;

SELECT * FROM tmp_sig_start ORDER BY symbol, start_day, horizon, side;

-- Confidence sensitivity (how many mentions excluded by the conf gate)
SELECT
  r.symbol,
  r.horizon,
  r.side,
  r.min_conf,
  COUNT(*) FILTER (WHERE b.conf >= r.min_conf) AS conf_ge_rule,
  COUNT(*) AS total_scored
FROM tmp_rules_sided r
JOIN (
  SELECT upper(m.symbol) AS symbol,
         m.created_utc::date AS d,
         s.confidence::numeric AS conf
  FROM reddit_mentions m
  JOIN reddit_sentiment s ON s.mention_id = m.mention_id
  WHERE s.model_version = :'MODEL_VERSION'
    AND m.doc_type IN ('post','comment')
    AND m.created_utc >= :'START_DATE'::date
    AND m.created_utc <  :'END_DATE'::date
) b ON b.symbol = r.symbol
GROUP BY 1,2,3,4
ORDER BY 1,2,3;
\endif
