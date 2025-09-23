  -- backtest_enabled_rules.sql (TEMP-table version) [moved to reddit-utils]
  -- Backtests all ENABLED LONG & SHORT rules in live_sentiment_entry_rules
  -- over a date window, using reddit_mentions + reddit_sentiment
  -- and enhanced_market_data for pricing.
  --
  -- Vars (override via -v):
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

  -- 1) Enabled rules to test
-- 1) Enabled rules pulled from live table (no side mirroring)
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
  -- optional filter if SYMBOLS provided
  AND (
        :'SYMBOLS' IS NULL
        OR upper(symbol) = ANY (string_to_array(upper(:'SYMBOLS'), ','))
      );

-- active model config (min_conf fallback)
DROP TABLE IF EXISTS tmp_model_cfg;
CREATE TEMP TABLE tmp_model_cfg AS
SELECT (min_confidence_score::numeric / 100.0) AS min_conf
FROM reddit_heuristics
WHERE is_active = true
  AND model_version = :'MODEL_VERSION'
ORDER BY effective_at DESC
LIMIT 1;

-- ensure one row exists (hard fallback 0.70)
INSERT INTO tmp_model_cfg (min_conf)
SELECT 0.70
WHERE NOT EXISTS (SELECT 1 FROM tmp_model_cfg);
-- If no enabled rules were found AND no SYMBOLS override, either bail gracefully
-- or synthesize defaults (toggle via a flag). Default: bail.
\if :{?SYNTH_IF_EMPTY} \else \set SYNTH_IF_EMPTY 0 \endif

-- synthesize defaults only if no enabled rules AND SYMBOLS provided AND SYNTH_IF_EMPTY!=0
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

-- simple alias so downstream still works without changing many names
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
  min_conf,
  use_weighted
FROM tmp_rules;

\if :DEBUG
  SELECT 'rules' AS label, COUNT(*) AS n FROM tmp_rules;
  SELECT 'rules_sided' AS label, COUNT(*) AS n FROM tmp_rules_sided;
\endif

  -- === Daily base sentiment (per symbol/day) ===
  -- === Daily base sentiment (per rule x symbol/day) honoring per-rule min_conf ===
-- === Daily base sentiment (per rule x symbol/day) honoring per-rule min_conf ===
DROP TABLE IF EXISTS tmp_daily_sent;
CREATE TEMP TABLE tmp_daily_sent AS
WITH base AS (
  SELECT
    upper(m.symbol)         AS symbol,
    m.created_utc::date     AS d,
    s.overall_score::numeric AS score,
    s.confidence::numeric    AS conf
  FROM reddit_mentions m
  JOIN reddit_sentiment s ON s.mention_id = m.mention_id
  WHERE s.model_version = :'MODEL_VERSION'
    AND m.doc_type IN ('post','comment')
    AND m.created_utc::date >= DATE :'START_DATE'
    AND m.created_utc::date <  DATE :'END_DATE'
)
SELECT
  r.symbol,
  r.horizon,
  r.side,
  r.dir,
  r.min_conf,
  b.d,
  COUNT(*)                                           AS mentions,
  AVG(b.score)                                       AS avg_raw,
  AVG(ABS(b.score))                                  AS avg_abs,
  AVG((b.score > 0)::int)::numeric                   AS pos_rate,
  AVG((b.score < 0)::int)::numeric                   AS neg_rate,
  AVG(SIGN(b.score))::numeric                        AS avg_sign,
  (SUM(b.score * b.conf) / NULLIF(SUM(b.conf),0))::numeric AS avg_w,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY b.score)::numeric AS median_score,
  ROUND(AVG(b.score), 2)                             AS avg_score 
FROM tmp_rules_sided r
JOIN base b
  ON b.symbol = r.symbol
 AND b.conf   >= r.min_conf
GROUP BY 1,2,3,4,5,6;

  -- 2) Prices with forward closes for 1/3/5 trading days
  DROP TABLE IF EXISTS tmp_px;
  CREATE TEMP TABLE tmp_px AS
  SELECT
    upper(symbol) AS symbol,
    data_date::date AS d,
    price_close::float8 AS close,
    lead(price_close, 1) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t1,
    lead(price_close, 3) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t3,
    lead(price_close, 5) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t5,
    lead(data_date, 1) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS d_t1,
    lead(data_date, 3) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS d_t3,
    lead(data_date, 5) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS d_t5
  FROM enhanced_market_data;

\if :DEBUG
    SELECT 'px_rows' AS label, COUNT(*) AS n FROM tmp_px;
  \endif

  -- 3) Mentions + sentiment (prefilter by MIN_CONF) in window
  DROP TABLE IF EXISTS tmp_scored;
  CREATE TEMP TABLE tmp_scored AS
  SELECT
    upper(m.symbol)                     AS symbol,
    m.created_utc::date                 AS d,
    COALESCE(s.score, 0)::float8        AS score,
    COALESCE(s.confidence, 0)::float8   AS conf
  FROM reddit_mentions m
  JOIN reddit_sentiment s
    ON s.mention_id = m.mention_id
  AND s.model_version = :'MODEL_VERSION'
  WHERE m.created_utc >= (:'START_DATE')::date
  AND m.created_utc <  (:'END_DATE')::date
  AND m.doc_type IN ('post','comment')
  AND m.symbol IS NOT NULL AND m.symbol <> ''
  AND COALESCE(s.confidence,0) >= COALESCE(NULLIF(:'MIN_CONF','')::numeric, 0.70)
  AND (
        :'SYMBOLS' IS NULL
        OR upper(m.symbol) = ANY (string_to_array(upper(:'SYMBOLS'), ','))
      );

\if :DEBUG
    SELECT 'scored_rows' AS label, COUNT(*) AS n FROM tmp_scored;
  \endif

  -- 4) Daily aggregation per rule (+ side), applying per-rule AND soft global floors
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
  d.d,
  COALESCE(d.mentions,0)::int   AS mentions,
  d.avg_raw, d.avg_abs, d.pos_rate, d.neg_rate,
  (COALESCE(d.pos_rate,0) - COALESCE(d.neg_rate,0)) AS net_pos,
  d.avg_sign, d.avg_w, d.median_score,
  d.avg_score,                                 -- debug convenience

  -- keep the rule threshold in the row
  r.pos_thresh,

  -- enough_mentions flag using the same safe MIN_MENTIONS_REQ logic
  (
    COALESCE(d.mentions,0) >= GREATEST(
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
       WHEN r.dir =  1 THEN COALESCE(d.pos_rate,0) >= COALESCE(NULLIF(:'POS_RATE_MIN','')::numeric, 0)
       WHEN r.dir = -1 THEN COALESCE(d.neg_rate,0) >= COALESCE(NULLIF(:'POS_RATE_MIN','')::numeric, 0)
     END)
    AND COALESCE(d.avg_abs,0) >= COALESCE(NULLIF(:'AVG_ABS_MIN','')::numeric, 0)
    AND COALESCE(d.mentions,0) > 0
  ) AS quality_ok,

  -- side-aware threshold on avg_raw
  CASE
    WHEN r.dir =  1 THEN (d.avg_raw IS NOT NULL AND d.avg_raw >=  r.pos_thresh)
    WHEN r.dir = -1 THEN (d.avg_raw IS NOT NULL AND d.avg_raw <= -r.pos_thresh)
    ELSE FALSE
  END AS pass_thresh_raw

FROM tmp_rules_sided r
LEFT JOIN tmp_daily_sent d
  ON d.symbol  = r.symbol
 AND d.horizon = r.horizon
 AND d.side    = r.side
 AND d.dir     = r.dir
 AND d.min_conf= r.min_conf;

  SELECT
    symbol, d, horizon, side, mentions,
    avg_score,                -- ✅ exists now via #1
    avg_raw, avg_abs, pos_rate, neg_rate, net_pos, avg_sign, avg_w, median_score,
    min_mentions, pos_thresh, enough_mentions, pass_thresh_raw
  FROM tmp_agg
  ORDER BY symbol, d, horizon, side
  LIMIT 200;

  -- Sweep pos_thresh values for TSLA/AAPL (debug only)
\if :DEBUG
  WITH thresholds AS (
    SELECT unnest(ARRAY[
      0.05,0.10,0.12,0.15,0.18,0.20,0.22,0.25,0.30
    ])::numeric AS pos_thresh
  ),
  rules AS (
    SELECT DISTINCT symbol, horizon, side, dir, min_mentions
    FROM tmp_rules_sided
    WHERE symbol IN ('TSLA','AAPL')
      AND horizon IN ('1d','3d')
  ),
  grid AS (
    SELECT r.symbol, r.horizon, r.side, r.dir, r.min_mentions, t.pos_thresh
    FROM rules r CROSS JOIN thresholds t
  ),
  sig_start AS (
    SELECT
      g.symbol, g.horizon, g.side, g.dir, g.min_mentions, g.pos_thresh,
      a.d AS start_day,
      CASE g.horizon WHEN '1d' THEN 1 WHEN '3d' THEN 3 WHEN '5d' THEN 5 END AS hold_days
    FROM tmp_agg a
    JOIN grid g USING (symbol,horizon,side,dir)
    WHERE a.mentions >= g.min_mentions
      AND (
            (g.side='LONG'  AND a.avg_raw >=  g.pos_thresh)
        OR (g.side='SHORT' AND a.avg_raw <= -g.pos_thresh)
          )
  ),
  fwd AS (
    SELECT
      ss.symbol, ss.horizon, ss.side, ss.dir, ss.pos_thresh,
      ss.start_day, ss.hold_days,
      CASE ss.hold_days
        WHEN 1 THEN px.close_t1
        WHEN 3 THEN px.close_t3
      END AS exit_close,
      CASE ss.hold_days
        WHEN 1 THEN ss.dir * (px.close_t1 / px.close - 1.0)
        WHEN 3 THEN ss.dir * (px.close_t3 / px.close - 1.0)
      END AS fwd_ret
    FROM sig_start ss
    JOIN tmp_px px ON px.symbol=ss.symbol AND px.d=ss.start_day
    WHERE ss.hold_days IN (1,3)
      AND CASE ss.hold_days
            WHEN 1 THEN px.close_t1
            WHEN 3 THEN px.close_t3
          END IS NOT NULL
  )
  SELECT
    symbol, horizon, side, pos_thresh,
    COUNT(*) AS n_trades,
    ROUND(AVG(fwd_ret)::numeric, 4) AS avg_ret,
    ROUND(AVG((fwd_ret>0)::int),3) AS win_rate,
    ROUND((
      CASE WHEN COUNT(*) > 1 AND stddev_pop(fwd_ret) > 0
          THEN (AVG(fwd_ret)/stddev_pop(fwd_ret))::numeric
          ELSE NULL
      END
    )::numeric, 4) AS sharpe
    FROM fwd
    GROUP BY symbol,horizon,side,pos_thresh
    ORDER BY symbol,horizon,side,pos_thresh;
\endif

  -- 5) Signal starts (add side-aware gating)
  -- 5) Signal starts (side-aware)
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

-- 6) Forward returns (guard everything if no signals)
DO $$
BEGIN
  -- Always drop temp outputs first to avoid "already exists" on re-runs
  DROP TABLE IF EXISTS tmp_px;
  DROP TABLE IF EXISTS tmp_fwd;
  DROP TABLE IF EXISTS tmp_per_symbol;
  DROP TABLE IF EXISTS tmp_overall;

  IF EXISTS (SELECT 1 FROM tmp_sig_start) THEN
    -- Rebuild tmp_px only when we have signals
    CREATE TEMP TABLE tmp_px AS
    SELECT
      upper(symbol) AS symbol,
      data_date::date AS d,
      price_close::float8 AS close,
      lead(price_close, 1) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t1,
      lead(price_close, 3) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t3,
      lead(price_close, 5) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS close_t5
    FROM enhanced_market_data;

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

DROP TABLE IF EXISTS tmp_trades;
CREATE TABLE tmp_trades AS
SELECT
  symbol,
  horizon,
  start_day,
  fwd_ret
FROM tmp_fwd;

  -- 9) Output
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
    FALSE               AS use_weighted,            -- ✅ hardcode since rules lack it
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
  SELECT
    a.symbol, a.d, a.horizon, a.side, a.mentions,
    a.avg_raw, a.avg_abs, a.pos_rate, a.neg_rate, a.net_pos, a.avg_sign,
    r.min_mentions, r.pos_thresh,
    a.enough_mentions, a.quality_ok,
    -- show the exact flag computed in tmp_agg
    a.pass_thresh_raw,
    -- recompute explicitly using avg_raw (matches tmp_sig_start)
    CASE
      WHEN a.side = 'LONG'  THEN a.avg_raw >=  r.pos_thresh
      WHEN a.side = 'SHORT' THEN a.avg_raw <= -r.pos_thresh
    END AS pass_avg_raw_check,
    -- optional: sign-based view for comparison
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


-- Confidence sensitivity (how many mentions we’re excluding by the conf gate)
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
    AND m.created_utc::date >= DATE :'START_DATE'
    AND m.created_utc::date <  DATE :'END_DATE'
) b ON b.symbol = r.symbol
GROUP BY 1,2,3,4
ORDER BY 1,2,3;
  \endif
