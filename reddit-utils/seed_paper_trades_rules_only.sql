-- ==============================================
-- Usage
-- ==============================================
-- Seeds paper trades using rules-only candidates in v_entry_candidates,
-- priced from enhanced_market_data (next open -> close_{1d|3d}).
--
-- psql "$PGURI" \
--   -v MODEL_VERSION=gpt-sent-v1 \
--   -v START_DATE=2025-06-01 \
--   -v END_DATE=2025-09-12 \
--   -v DPT=1000 \
--   -v DAILY_MAX=5 \
--   -v MIN_MARGIN=0.00 \
--   -v DEBUG=0 \
--   -f moonshot-memestock-hub/reddit-utils/seed_paper_trades_rules_only.sql
--
-- Or use the runner:
--   PGURI="$PGURI" moonshot-memestock-hub/reddit-utils/run_seed_paper_trades_rules_only.sh \
--     2025-06-01 2025-09-12 gpt-sent-v1
-- ==============================================
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format aligned

\if :{?MODEL_VERSION}
\else
  \set MODEL_VERSION 'gpt-sent-v1'
\endif

\if :{?START_DATE}
\else
  \set START_DATE '2025-08-01'
\endif

\if :{?END_DATE}
\else
  \set END_DATE   '2025-09-05'
\endif

\if :{?DPT}
\else  \set DPT 1000
\endif

\if :{?DAILY_MAX}
\else
  \set DAILY_MAX 5
\endif

\if :{?MIN_MARGIN}
\else
  \set MIN_MARGIN 0.00
\endif

\if :{?DPT_BY_BAND}
\else
  \set DPT_BY_BAND NULL
\endif

\if :{?DRY_RUN}
\else
  \set DRY_RUN 0
\endif

\if :{?DEBUG}
\else
  \set DEBUG 0
\endif

\if :{?BAND_STRONG}
\else
  \set BAND_STRONG 0.35
\endif

\if :{?BAND_MODERATE}
\else
  \set BAND_MODERATE 0.20
\endif

\if :{?BAND_WEAK}
\else
  \set BAND_WEAK 0.10
\endif

-- Clean up any leftovers
DROP TABLE IF EXISTS filtered;
DROP TABLE IF EXISTS sched;
DROP TABLE IF EXISTS priced;
DROP TABLE IF EXISTS ranked;
DROP TABLE IF EXISTS final_inserts;

DROP TABLE IF EXISTS seed_band_params;
CREATE TEMP TABLE seed_band_params AS
SELECT
  (:'BAND_STRONG')::numeric   AS band_strong,
  (:'BAND_MODERATE')::numeric AS band_moderate,
  (:'BAND_WEAK')::numeric     AS band_weak,
  CASE WHEN NULLIF(BTRIM(:'DPT_BY_BAND'), '') IS NULL THEN 0 ELSE 1 END AS use_band_scaling;

DROP TABLE IF EXISTS seed_band_multipliers;
CREATE TEMP TABLE seed_band_multipliers AS
WITH raw AS (
  SELECT
    UPPER(BTRIM(split_part(pair, ':', 1))) AS band,
    NULLIF(split_part(pair, ':', 2), '')::numeric AS factor
  FROM regexp_split_to_table(
         COALESCE(NULLIF(BTRIM(:'DPT_BY_BAND'), ''), 'STRONG:1.0,MODERATE:1.0,WEAK:1.0,VERY_WEAK:1.0'),
         ','
       ) AS pair
), defaults AS (
  SELECT * FROM (VALUES
    ('STRONG', 1.0),
    ('MODERATE', 1.0),
    ('WEAK', 1.0),
    ('VERY_WEAK', 1.0)
  ) AS d(band, factor)
)
SELECT d.band,
       COALESCE(r.factor, d.factor) AS factor
FROM defaults d
LEFT JOIN raw r ON r.band = d.band;

-- 1) Base filter from rules-only candidates
CREATE TEMP TABLE filtered AS
WITH base AS (
  SELECT
    c.trade_date,
    upper(c.symbol) AS symbol_u,
    c.symbol,
    c.side,
    c.horizon,
    c.n_mentions,
    c.pos_thresh,
    c.use_weighted,
    c.min_mentions,
    c.avg_score,
    c.score            AS used_score,
    c.margin,
    c.model_version,
    CASE
      WHEN c.pos_thresh >= bp.band_strong   THEN 'STRONG'
      WHEN c.pos_thresh >= bp.band_moderate THEN 'MODERATE'
      WHEN c.pos_thresh >= bp.band_weak     THEN 'WEAK'
      ELSE 'VERY_WEAK'
    END AS band
  FROM v_entry_candidates c
  CROSS JOIN seed_band_params bp
  WHERE c.model_version = :'MODEL_VERSION'
    AND c.trade_date BETWEEN DATE :'START_DATE' AND DATE :'END_DATE'
    AND c.margin >= (:'MIN_MARGIN')::numeric
),
heuristics_raw AS (
  SELECT
    COALESCE(ta_config, '{}'::jsonb) AS cfg,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE WHEN model_version = :'MODEL_VERSION' THEN 0 ELSE 1 END,
        effective_at DESC
    ) AS rk
  FROM reddit_heuristics
  WHERE is_active = true
    AND (model_version IS NULL OR model_version = :'MODEL_VERSION')
),
heuristics AS (
  SELECT COALESCE((SELECT cfg FROM heuristics_raw WHERE rk = 1), '{}'::jsonb) AS cfg
),
heuristics_expanded AS (
  SELECT
    NULLIF(cfg->>'global_min_volume_ratio','')::numeric AS global_min_volume_ratio,
    NULLIF(cfg->>'global_min_volume_share','')::numeric AS global_min_volume_share,
    NULLIF(cfg->>'global_min_volume_z','')::numeric     AS global_min_volume_z,
    NULLIF(cfg->>'global_rsi_long_max','')::numeric     AS global_rsi_long_max,
    NULLIF(cfg->>'global_rsi_short_min','')::numeric    AS global_rsi_short_min,
    COALESCE(cfg->'symbol_min_volume_ratio', '{}'::jsonb) AS symbol_min_volume_ratio,
    COALESCE(cfg->'symbol_min_volume_share', '{}'::jsonb) AS symbol_min_volume_share,
    COALESCE(cfg->'symbol_min_volume_z', '{}'::jsonb)     AS symbol_min_volume_z,
    COALESCE(cfg->'symbol_rsi_long_max', '{}'::jsonb)     AS symbol_rsi_long_max,
    COALESCE(cfg->'symbol_rsi_short_min', '{}'::jsonb)    AS symbol_rsi_short_min,
    COALESCE(cfg->'symbol_exclude', '[]'::jsonb)          AS symbol_exclude
  FROM heuristics
),
symbol_ratio_overrides AS (
  SELECT upper(key) AS symbol, NULLIF(value,'')::numeric AS min_volume_ratio
  FROM heuristics_expanded,
       LATERAL jsonb_each_text(symbol_min_volume_ratio)
),
symbol_share_overrides AS (
  SELECT upper(key) AS symbol, NULLIF(value,'')::numeric AS min_volume_share
  FROM heuristics_expanded,
       LATERAL jsonb_each_text(symbol_min_volume_share)
),
symbol_z_overrides AS (
  SELECT upper(key) AS symbol, NULLIF(value,'')::numeric AS min_volume_z
  FROM heuristics_expanded,
       LATERAL jsonb_each_text(symbol_min_volume_z)
),
symbol_rsi_long_overrides AS (
  SELECT upper(key) AS symbol, NULLIF(value,'')::numeric AS rsi_long_max
  FROM heuristics_expanded,
       LATERAL jsonb_each_text(symbol_rsi_long_max)
),
symbol_rsi_short_overrides AS (
  SELECT upper(key) AS symbol, NULLIF(value,'')::numeric AS rsi_short_min
  FROM heuristics_expanded,
       LATERAL jsonb_each_text(symbol_rsi_short_min)
),
symbol_exclusions AS (
  SELECT
    upper(split_part(val, ':', 1)) AS symbol,
    NULLIF(upper(split_part(val, ':', 2)), '') AS side
  FROM heuristics_expanded,
       LATERAL jsonb_array_elements_text(symbol_exclude) AS val
),
enriched AS (
  SELECT
    b.trade_date,
    b.symbol,
    b.symbol_u,
    b.side,
    b.horizon,
    b.n_mentions,
    b.pos_thresh,
    b.use_weighted,
    b.min_mentions,
    b.avg_score,
    b.used_score,
    b.margin,
    b.model_version,
    b.band,
    f.volume_ratio_avg_20,
    f.volume_share_20,
    f.volume_zscore_20,
    f.rsi_14,
    COALESCE(svr.min_volume_ratio, he.global_min_volume_ratio) AS eff_min_volume_ratio,
    COALESCE(svs.min_volume_share, he.global_min_volume_share) AS eff_min_volume_share,
    COALESCE(svz.min_volume_z,      he.global_min_volume_z)    AS eff_min_volume_z,
    COALESCE(srl.rsi_long_max,      he.global_rsi_long_max)    AS eff_rsi_long_max,
    COALESCE(srs.rsi_short_min,     he.global_rsi_short_min)   AS eff_rsi_short_min,
    CASE WHEN se.symbol IS NOT NULL THEN TRUE ELSE FALSE END   AS is_excluded
  FROM base b
  LEFT JOIN v_market_rolling_features f
    ON f.symbol = b.symbol_u
   AND f.data_date = b.trade_date
  CROSS JOIN heuristics_expanded he
  LEFT JOIN symbol_ratio_overrides svr ON svr.symbol = b.symbol_u
  LEFT JOIN symbol_share_overrides svs ON svs.symbol = b.symbol_u
  LEFT JOIN symbol_z_overrides     svz ON svz.symbol = b.symbol_u
  LEFT JOIN symbol_rsi_long_overrides  srl ON srl.symbol = b.symbol_u
  LEFT JOIN symbol_rsi_short_overrides srs ON srs.symbol = b.symbol_u
  LEFT JOIN symbol_exclusions se
    ON se.symbol = b.symbol_u
   AND (se.side IS NULL OR se.side = b.side)
)
SELECT
  e.trade_date,
  e.symbol,
  e.side,
  e.horizon,
  e.n_mentions,
  e.pos_thresh,
  e.use_weighted,
  e.min_mentions,
  e.avg_score,
  e.used_score,
  e.margin,
  e.model_version,
  e.band,
  e.volume_ratio_avg_20,
  e.volume_share_20,
  e.volume_zscore_20,
  e.rsi_14
FROM enriched e
WHERE NOT e.is_excluded
  AND (
        e.eff_min_volume_ratio IS NULL
        OR e.volume_ratio_avg_20 IS NULL
        OR e.volume_ratio_avg_20 >= e.eff_min_volume_ratio
      )
  AND (
        e.eff_min_volume_share IS NULL
        OR e.volume_share_20 IS NULL
        OR e.volume_share_20 >= e.eff_min_volume_share
      )
  AND (
        e.eff_min_volume_z IS NULL
        OR e.volume_zscore_20 IS NULL
        OR e.volume_zscore_20 >= e.eff_min_volume_z
      )
  AND (
        e.side <> 'LONG'
        OR e.eff_rsi_long_max IS NULL
        OR e.rsi_14 IS NULL
        OR e.rsi_14 <= e.eff_rsi_long_max
      )
  AND (
        e.side <> 'SHORT'
        OR e.eff_rsi_short_min IS NULL
        OR e.rsi_14 IS NULL
        OR e.rsi_14 >= e.eff_rsi_short_min
      );

-- 2) Schedule entry/exit dates (T+1 open → close_{1d|3d})
CREATE TEMP TABLE sched AS
SELECT
  f.*,
  add_trading_days(f.trade_date, 1) AS entry_d,
  CASE
    WHEN f.horizon = '1d' THEN add_trading_days(f.trade_date, 1)      -- same day close
    WHEN f.horizon = '3d' THEN add_trading_days(f.trade_date, 3)      -- T+3 close
    ELSE add_trading_days(f.trade_date, 5)      -- default: 5d horizon
  END AS exit_d
FROM filtered f;

-- 3) Price the schedule from enhanced_market_data
CREATE TEMP TABLE priced AS
SELECT
  s.*,
  pe.price_open  AS entry_price,
  px.price_close AS exit_price
FROM sched s
LEFT JOIN enhanced_market_data pe
  ON pe.symbol = s.symbol AND pe.data_date = s.entry_d
LEFT JOIN enhanced_market_data px
  ON px.symbol = s.symbol AND px.data_date = s.exit_d;

-- 4) Rank per trade_date by margin (best first), cap with DAILY_MAX
CREATE TEMP TABLE ranked AS
SELECT
  p.*,
  ROW_NUMBER() OVER (PARTITION BY p.trade_date ORDER BY p.margin DESC, abs(p.used_score) DESC, p.symbol) AS rn
FROM priced p;

-- 5) Final rows to insert (with qty & timestamps)
CREATE TEMP TABLE final_inserts AS
SELECT
  r.trade_date,
  r.symbol,
  r.side,
  r.horizon,
  r.model_version,
  r.entry_d,
  r.exit_d,
  r.entry_price,
  r.exit_price,
  COALESCE(
    CASE WHEN bp.use_band_scaling = 1 THEN bm.factor ELSE 1 END,
    1
  ) AS band_factor,
  GREATEST(
    1,
    FLOOR((:'DPT')::numeric * COALESCE(
      CASE WHEN bp.use_band_scaling = 1 THEN bm.factor ELSE 1 END,
      1
    ) / NULLIF(r.entry_price,0))
  )::int AS qty,
  r.min_mentions,
  r.pos_thresh,
  r.use_weighted,
  r.used_score,
  r.margin,
  r.band
FROM ranked r
CROSS JOIN seed_band_params bp
LEFT JOIN seed_band_multipliers bm ON bm.band = r.band
WHERE r.rn <= (:'DAILY_MAX')::int
  AND r.entry_price IS NOT NULL
  AND r.exit_price  IS NOT NULL;

\echo '-- Final inserts band summary (pre-insert) --'
SELECT
  band,
  ROUND(MIN(band_factor)::numeric, 3) AS min_factor,
  ROUND(MAX(band_factor)::numeric, 3) AS max_factor,
  SUM(qty) AS total_qty,
  COUNT(*) AS n_trades
FROM final_inserts
GROUP BY 1
ORDER BY band;

-- 6) Insert into trades
\if :DRY_RUN
  \echo 'DRY_RUN=1 -> skipping insert into trades; count reflects would-be rows.'
  SELECT COUNT(*) AS would_insert
  FROM final_inserts f
  WHERE NOT EXISTS (
    SELECT 1 FROM trades t
    WHERE t.symbol = f.symbol
      AND t.side = f.side
      AND t.horizon = f.horizon
      AND t.trade_date = f.trade_date
      AND t.source = 'rules-backfill-v2'
  );
\else
WITH ins AS (
  INSERT INTO trades (
    trade_id, created_at, symbol, side, horizon, mode, source,
    trade_date, entry_ts, entry_price, exit_ts, exit_price, qty, fees_total,
    status, notes, audit
  )
  SELECT
    gen_random_uuid(),
    now(),
    f.symbol,
    f.side,
    f.horizon,
    'paper',
    'rules-backfill-v2',
    f.trade_date,
    (f.entry_d::timestamp at time zone 'UTC') + time '13:30', -- US cash open 9:30 ET = 13:30 UTC
    f.entry_price,
    (f.exit_d::timestamp at time zone 'UTC')  + time '20:00', -- US cash close 16:00 ET = 20:00 UTC
    f.exit_price,
    f.qty,
    0,
    'CLOSED',
    'backfill ' || f.symbol || ' ' || f.horizon ||
      ' mm=' || f.min_mentions ||
      ' thr=' || f.pos_thresh ||
      ' wt=' || CASE WHEN f.use_weighted THEN 'weighted' ELSE 'unweighted' END ||
      ' score=' || f.used_score ||
      ' band=' || f.band ||
      ' x=' || f.band_factor ||
      ' | model=' || f.model_version ||
      ' | px=next_open→close_' || f.horizon,
    jsonb_build_object(
      'pos_thresh', f.pos_thresh,
      'used_score', f.used_score,
      'min_mentions', f.min_mentions,
      'use_weighted', f.use_weighted,
      'band', f.band,
      'band_factor', f.band_factor
    )
  FROM final_inserts f
  -- basic de-dupe: don't reinsert if same (symbol,side,horizon,trade_date,source)
  WHERE NOT EXISTS (
    SELECT 1 FROM trades t
    WHERE t.symbol = f.symbol
      AND t.side = f.side
      AND t.horizon = f.horizon
      AND t.trade_date = f.trade_date
      AND t.source = 'rules-backfill-v2'
  )
  RETURNING 1
)
SELECT count(*) AS inserted FROM ins;
\endif

-- ===== Optional DEBUG output =====
\if :DEBUG
  DROP TABLE IF EXISTS dbg_filtered;
  DROP TABLE IF EXISTS dbg_sched;
  DROP TABLE IF EXISTS dbg_priced;
  DROP TABLE IF EXISTS dbg_ranked;
  DROP TABLE IF EXISTS dbg_final;

  CREATE TABLE dbg_filtered AS TABLE filtered;
  CREATE TABLE dbg_sched    AS TABLE sched;
  CREATE TABLE dbg_priced   AS TABLE priced;
  CREATE TABLE dbg_ranked   AS TABLE ranked;
  CREATE TABLE dbg_final    AS TABLE final_inserts;

  \echo '=== Seed diagnostics ==='
  \echo 'Model:' :MODEL_VERSION 'Dates:' :START_DATE '..' :END_DATE 'DPT=' :DPT 'DAILY_MAX=' :DAILY_MAX 'MIN_MARGIN=' :MIN_MARGIN

  SELECT
    (SELECT count(*) FROM filtered)      AS n_filtered,
    (SELECT count(*) FROM sched)         AS n_sched,
    (SELECT count(*) FROM priced)        AS n_priced,
    (SELECT count(*) FROM ranked)        AS n_ranked,
    (SELECT count(*) FROM final_inserts) AS n_final;

  \echo '-- Missing prices (first 20) --'
  SELECT symbol, trade_date, horizon, entry_d, exit_d, entry_price, exit_price
  FROM priced
  WHERE entry_price IS NULL OR exit_price IS NULL
  ORDER BY trade_date, symbol, horizon
  LIMIT 20;

  \echo '-- Ranked (first 20) --'
  SELECT trade_date, symbol, side, horizon, margin, used_score, entry_price, exit_price, rn
  FROM ranked
  ORDER BY trade_date, rn
  LIMIT 20;

  \echo '-- Final inserts --'
  SELECT * FROM final_inserts ORDER BY trade_date, symbol, horizon;

  \echo '-- Trades inserted this run (source=rules-backfill-v2) --'
  SELECT symbol, side, horizon, trade_date, entry_ts, entry_price, exit_ts, exit_price, qty
  FROM trades
  WHERE source='rules-backfill-v2'
    AND trade_date BETWEEN DATE :'START_DATE' AND DATE :'END_DATE'
  ORDER BY trade_date, symbol, horizon;
\endif
