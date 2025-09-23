\set ON_ERROR_STOP on

-- Parameter defaults
\if :{?START_DATE}      \else \set START_DATE      '2024-01-01' \endif
\if :{?END_DATE}        \else \set END_DATE        '' \endif
\if :{?WINNER_MIN_RET}  \else \set WINNER_MIN_RET  '0.03' \endif
\if :{?MODE_LIST}       \else \set MODE_LIST       'paper,real' \endif
\if :{?SOURCE_LIST}     \else \set SOURCE_LIST     '' \endif
\if :{?SYMBOL_LIMIT}    \else \set SYMBOL_LIMIT    20 \endif

\echo '--- Historical Winner Retention Parameters ---'
SELECT
  (CASE
     WHEN NULLIF(:'START_DATE','') IS NULL THEN DATE '2024-01-01'
     ELSE :'START_DATE'::date
   END) AS start_date,
  COALESCE(NULLIF(:'END_DATE','')::date, CURRENT_DATE) AS end_date,
  :'WINNER_MIN_RET'::numeric AS min_realized_ret,
  NULLIF(:'MODE_LIST','')   AS mode_list,
  NULLIF(:'SOURCE_LIST','') AS source_list;

DROP TABLE IF EXISTS tmp_params;
CREATE TEMP TABLE tmp_params AS
SELECT
  (CASE
     WHEN NULLIF(:'START_DATE','') IS NULL THEN DATE '2024-01-01'
     ELSE :'START_DATE'::date
   END) AS start_date,
  COALESCE(NULLIF(:'END_DATE','')::date, CURRENT_DATE) AS end_date,
  :'WINNER_MIN_RET'::numeric AS min_realized_ret,
  NULLIF(:'MODE_LIST','')   AS mode_list,
  NULLIF(:'SOURCE_LIST','') AS source_list;

DROP TABLE IF EXISTS tmp_filtered_trades;
CREATE TEMP TABLE tmp_filtered_trades AS
SELECT
  t.trade_id,
  upper(t.symbol) AS symbol,
  t.symbol AS symbol_raw,
  t.side,
  t.horizon,
  t.mode,
  t.source,
  t.trade_date,
  t.entry_price,
  t.exit_price,
  CASE
    WHEN t.exit_price IS NULL THEN NULL
    WHEN t.side = 'LONG'  THEN (t.exit_price - t.entry_price) / NULLIF(t.entry_price, 0)
    WHEN t.side = 'SHORT' THEN (t.entry_price - t.exit_price) / NULLIF(t.entry_price, 0)
    ELSE NULL
  END AS realized_pct
FROM trades t
CROSS JOIN tmp_params p
WHERE t.status = 'CLOSED'
  AND t.exit_price IS NOT NULL
  AND t.trade_date BETWEEN p.start_date AND p.end_date
  AND (p.mode_list IS NULL OR t.mode = ANY(string_to_array(p.mode_list, ',')::text[]))
  AND (p.source_list IS NULL OR t.source = ANY(string_to_array(p.source_list, ',')::text[]));

DROP TABLE IF EXISTS tmp_winners;
CREATE TEMP TABLE tmp_winners AS
SELECT ft.*
FROM tmp_filtered_trades ft
CROSS JOIN tmp_params p
WHERE ft.realized_pct IS NOT NULL
  AND ft.realized_pct >= p.min_realized_ret;

DROP TABLE IF EXISTS tmp_winners_enriched;
CREATE TEMP TABLE tmp_winners_enriched AS
SELECT
  w.trade_id,
  w.symbol,
  w.symbol_raw,
  w.side,
  w.horizon,
  w.mode,
  w.source,
  w.trade_date,
  w.entry_price,
  w.exit_price,
  w.realized_pct,
  f.volume_ratio_avg_20,
  f.volume_share_20,
  f.volume_zscore_20,
  f.rsi_14,
  COALESCE(NULLIF(regexp_replace(w.horizon, '\D', '', 'g'), ''), '0')::int AS horizon_days
FROM tmp_winners w
LEFT JOIN v_market_rolling_features f
  ON f.symbol = w.symbol
 AND f.data_date = w.trade_date;

DROP TABLE IF EXISTS tmp_gate_presets;
CREATE TEMP TABLE tmp_gate_presets AS
SELECT * FROM (
  VALUES
    ('baseline',             NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::text[]),
    ('ratio_103',            1.03,          NULL,           NULL,           NULL,           NULL,           NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::text[]),
    ('ratio_105',            1.05,          NULL,           NULL,           NULL,           NULL,           NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::text[]),
    ('ratio_103_share50',    1.03,          0.50,           NULL,           NULL,           NULL,           NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::text[]),
    ('ratio_105_share45',    1.05,          0.45,           NULL,           NULL,           NULL,           NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::text[]),
    ('rsi_70_55',            NULL,          NULL,           NULL,           70,             55,             NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::text[]),
    ('ratio_103_rsi',        1.03,          NULL,           NULL,           70,             55,             NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::text[]),
    ('ratio_105_rsi',        1.05,          NULL,           NULL,           70,             55,             NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::text[]),
    ('ratio_105_share45_rsi',1.05,          0.45,           NULL,           70,             55,             NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::text[]),
    ('ratio_105_rsi_tsla_ex',1.05,          NULL,           NULL,           70,             55,             NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, ARRAY['TSLA:SHORT']::text[]),
    ('ratio_105_rsi_sofi95', 1.05,          NULL,           NULL,           70,             55,             '{"SOFI":"0.95","ASTS":"1.00"}'::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::text[]),
    ('rsi_70_55_symbol',     NULL,          NULL,           NULL,           70,             55,             NULL::jsonb, NULL::jsonb, NULL::jsonb, '{"SOFI":"80","ASTS":"95","NVDA":"85"}'::jsonb, NULL::jsonb, NULL::text[]),
    ('ratio_105_rsi_symbol', 1.05,          NULL,           NULL,           70,             55,             '{"SOFI":"0.95","ASTS":"1.00"}'::jsonb, NULL::jsonb, NULL::jsonb, '{"SOFI":"80","ASTS":"95","NVDA":"85"}'::jsonb, NULL::jsonb, ARRAY['TSLA:SHORT']::text[])
) AS g(
  scenario,
  min_volume_ratio,
  min_volume_share,
  min_volume_z,
  rsi_long_max,
  rsi_short_min,
  symbol_min_volume_ratio,
  symbol_min_volume_share,
  symbol_min_volume_z,
  symbol_rsi_long_max,
  symbol_rsi_short_min,
  symbol_exclude
);

DROP TABLE IF EXISTS tmp_scenario_eval;
CREATE TEMP TABLE tmp_scenario_eval AS
SELECT
  g.scenario,
  w.trade_id,
  w.symbol,
  w.side,
  w.horizon,
  w.mode,
  w.source,
  w.trade_date,
  w.realized_pct,
  w.horizon_days,
  w.volume_ratio_avg_20,
  w.volume_share_20,
  w.volume_zscore_20,
  w.rsi_14,
  cfg.eff_min_volume_ratio,
  cfg.eff_min_volume_share,
  cfg.eff_min_volume_z,
  cfg.eff_rsi_long_max,
  cfg.eff_rsi_short_min,
  cfg.is_symbol_excluded,
  (
    NOT cfg.is_symbol_excluded
    AND (cfg.eff_min_volume_ratio IS NULL
      OR w.volume_ratio_avg_20 IS NULL
      OR w.volume_ratio_avg_20 >= cfg.eff_min_volume_ratio)
    AND (cfg.eff_min_volume_share IS NULL
      OR w.volume_share_20 IS NULL
      OR w.volume_share_20 >= cfg.eff_min_volume_share)
    AND (cfg.eff_min_volume_z IS NULL
      OR w.volume_zscore_20 IS NULL
      OR w.volume_zscore_20 >= cfg.eff_min_volume_z)
    AND (
      CASE
        WHEN w.side = 'LONG' THEN (
          cfg.eff_rsi_long_max IS NULL
          OR w.rsi_14 IS NULL
          OR w.rsi_14 <= cfg.eff_rsi_long_max
        )
        WHEN w.side = 'SHORT' THEN (
          cfg.eff_rsi_short_min IS NULL
          OR w.rsi_14 IS NULL
          OR w.rsi_14 >= cfg.eff_rsi_short_min
        )
        ELSE TRUE
      END
    )
  ) AS passes_gate
FROM tmp_gate_presets g
CROSS JOIN tmp_winners_enriched w
CROSS JOIN LATERAL (
  SELECT
    COALESCE((g.symbol_min_volume_ratio ->> w.symbol)::numeric, g.min_volume_ratio) AS eff_min_volume_ratio,
    COALESCE((g.symbol_min_volume_share ->> w.symbol)::numeric, g.min_volume_share) AS eff_min_volume_share,
    COALESCE((g.symbol_min_volume_z     ->> w.symbol)::numeric, g.min_volume_z)     AS eff_min_volume_z,
    COALESCE((g.symbol_rsi_long_max     ->> w.symbol)::numeric, g.rsi_long_max)     AS eff_rsi_long_max,
    COALESCE((g.symbol_rsi_short_min    ->> w.symbol)::numeric, g.rsi_short_min)    AS eff_rsi_short_min,
    EXISTS (
      SELECT 1
      FROM unnest(COALESCE(g.symbol_exclude, ARRAY[]::text[])) AS ex(val)
      WHERE upper(split_part(ex.val, ':', 1)) = w.symbol
        AND (split_part(ex.val, ':', 2) = '' OR upper(split_part(ex.val, ':', 2)) = w.side)
    ) AS is_symbol_excluded
) cfg;

DROP TABLE IF EXISTS tmp_base_summary;
CREATE TEMP TABLE tmp_base_summary AS
SELECT
  COUNT(*) AS total_winners,
  ROUND(AVG(realized_pct), 6) AS avg_ret,
  ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY realized_pct))::numeric, 6) AS median_ret,
  ROUND(STDDEV_SAMP(realized_pct), 6) AS stddev_ret,
  ROUND(MIN(realized_pct), 6) AS min_ret,
  ROUND(MAX(realized_pct), 6) AS max_ret
FROM tmp_winners;

DROP TABLE IF EXISTS tmp_summary;
CREATE TEMP TABLE tmp_summary AS
SELECT
  se.scenario,
  COUNT(*) AS total_winners,
  COUNT(*) FILTER (WHERE passes_gate) AS kept_winners,
  COUNT(*) FILTER (WHERE NOT passes_gate) AS lost_winners,
  ROUND(COUNT(*) FILTER (WHERE passes_gate)::numeric / NULLIF(COUNT(*), 0) * 100, 2) AS retention_pct,
  ROUND(AVG(realized_pct) FILTER (WHERE passes_gate), 6) AS avg_ret_kept,
  ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY realized_pct) FILTER (WHERE passes_gate))::numeric, 6) AS median_ret_kept,
  ROUND(STDDEV_SAMP(realized_pct) FILTER (WHERE passes_gate), 6) AS stddev_ret_kept,
  ROUND(MIN(realized_pct) FILTER (WHERE passes_gate), 6) AS min_ret_kept,
  ROUND(MAX(realized_pct) FILTER (WHERE passes_gate), 6) AS max_ret_kept,
  ROUND(
    AVG(realized_pct) FILTER (WHERE passes_gate)
    / NULLIF(STDDEV_SAMP(realized_pct) FILTER (WHERE passes_gate), 0)
  , 6) AS sharpe_simple
FROM tmp_scenario_eval se
GROUP BY se.scenario;

DROP TABLE IF EXISTS tmp_symbol_breakdown;
CREATE TEMP TABLE tmp_symbol_breakdown AS
SELECT
  se.scenario,
  se.symbol,
  COUNT(*) AS total_winners,
  COUNT(*) FILTER (WHERE passes_gate) AS kept_winners,
  COUNT(*) FILTER (WHERE NOT passes_gate) AS lost_winners,
  ROUND(COUNT(*) FILTER (WHERE passes_gate)::numeric / NULLIF(COUNT(*), 0) * 100, 2) AS retention_pct,
  ROUND(AVG(realized_pct) FILTER (WHERE passes_gate), 6) AS avg_ret_kept
FROM tmp_scenario_eval se
GROUP BY se.scenario, se.symbol;

DROP TABLE IF EXISTS tmp_loss_examples;
CREATE TEMP TABLE tmp_loss_examples AS
SELECT
  se.scenario,
  se.symbol,
  se.side,
  se.horizon,
  se.trade_date,
  se.realized_pct,
  se.volume_ratio_avg_20,
  se.volume_share_20,
  se.rsi_14,
  ROW_NUMBER() OVER (
    PARTITION BY se.scenario
    ORDER BY se.realized_pct DESC
  ) AS rn
FROM tmp_scenario_eval se
WHERE NOT se.passes_gate;

SELECT 'winner_universe' AS section, bs.*
FROM tmp_base_summary bs;

SELECT 'winner_retention_summary' AS section,
       scenario,
       total_winners,
       kept_winners,
       lost_winners,
       retention_pct,
       avg_ret_kept,
       median_ret_kept,
       stddev_ret_kept,
       min_ret_kept,
       max_ret_kept,
       sharpe_simple
FROM tmp_summary s
ORDER BY s.scenario;

SELECT 'symbol_retention' AS section,
       scenario,
       symbol,
       total_winners,
       kept_winners,
       lost_winners,
       retention_pct,
       avg_ret_kept
FROM tmp_symbol_breakdown sb
WHERE sb.lost_winners > 0
ORDER BY sb.scenario, sb.lost_winners DESC, sb.symbol
LIMIT (:SYMBOL_LIMIT::int) * (SELECT COUNT(*) FROM tmp_gate_presets);

SELECT 'top_lost_examples' AS section,
       scenario,
       symbol,
       side,
       horizon,
       trade_date,
       ROUND(realized_pct, 6) AS realized_pct,
       ROUND(volume_ratio_avg_20, 6) AS volume_ratio_avg_20,
       ROUND(volume_share_20, 6) AS volume_share_20,
       ROUND(rsi_14, 6) AS rsi_14
FROM tmp_loss_examples le
WHERE le.rn <= :SYMBOL_LIMIT::int
ORDER BY le.scenario, le.rn;

\echo '--- Historical winner retention analysis complete ---'
