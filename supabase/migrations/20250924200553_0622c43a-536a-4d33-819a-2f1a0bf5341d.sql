-- Fix v_live_rules_effective view to avoid duplicate ta_config identifiers
DROP VIEW IF EXISTS public.v_live_rules_effective;

CREATE VIEW public.v_live_rules_effective AS
SELECT
  r.model_version,
  r.symbol,
  r.horizon,
  r.side,
  r.min_mentions,
  r.pos_thresh,
  r.min_conf,
  r.use_weighted,
  r.is_enabled,
  r.trades,
  r.avg_ret,
  r.median_ret,
  r.win_rate,
  r.sharpe,
  r.q_value,
  r.start_date,
  r.end_date,
  r.created_at,
  r.notes,
  r.priority,
  m.avg_volume_ratio_avg_20,
  m.avg_volume_share_20,
  m.avg_volume_zscore_20,
  m.avg_rsi_14,
  evals.eff_min_volume_ratio,
  evals.eff_min_volume_share,
  evals.eff_min_volume_z,
  evals.eff_rsi_long_max,
  evals.eff_rsi_short_min,
  evals.ta_symbol_excluded,
  evals.volume_ratio_pass,
  evals.volume_share_pass,
  evals.volume_z_pass,
  evals.rsi_pass,
  (NOT evals.ta_symbol_excluded
   AND evals.volume_ratio_pass
   AND evals.volume_share_pass
   AND evals.volume_z_pass
   AND evals.rsi_pass) AS ta_pass
FROM public.live_sentiment_entry_rules r
LEFT JOIN LATERAL (
  SELECT COALESCE(h.ta_config, '{}'::jsonb) AS config_data
  FROM public.reddit_heuristics h
  WHERE h.is_active = true
    AND (h.model_version IS NULL OR h.model_version = r.model_version)
  ORDER BY
    CASE WHEN h.model_version = r.model_version THEN 0 ELSE 1 END,
    h.effective_at DESC
  LIMIT 1
) cfg ON TRUE
LEFT JOIN LATERAL (
  SELECT
    b.avg_volume_ratio_avg_20,
    b.avg_volume_share_20,
    b.avg_volume_zscore_20,
    b.avg_rsi_14
  FROM public.backtest_sweep_results b
  WHERE b.model_version = r.model_version
    AND upper(b.symbol) = upper(r.symbol)
    AND b.horizon = r.horizon
    AND b.side = r.side
    AND b.min_mentions = r.min_mentions
    AND b.pos_thresh = r.pos_thresh
  ORDER BY
    CASE
      WHEN r.start_date IS NOT NULL
       AND r.end_date IS NOT NULL
       AND b.start_date = r.start_date
       AND b.end_date = r.end_date THEN 0
      ELSE 1
    END,
    b.end_date DESC NULLS LAST
  LIMIT 1
) m ON TRUE
CROSS JOIN LATERAL (
  WITH raw AS (
    SELECT
      NULLIF(cfg.config_data->>'global_min_volume_ratio','')::numeric AS global_min_volume_ratio,
      NULLIF(cfg.config_data->>'global_min_volume_share','')::numeric AS global_min_volume_share,
      NULLIF(cfg.config_data->>'global_min_volume_z','')::numeric     AS global_min_volume_z,
      NULLIF(cfg.config_data->>'global_rsi_long_max','')::numeric     AS global_rsi_long_max,
      NULLIF(cfg.config_data->>'global_rsi_short_min','')::numeric    AS global_rsi_short_min,
      NULLIF(cfg.config_data->'symbol_min_volume_ratio'->>upper(r.symbol),'')::numeric AS symbol_min_volume_ratio,
      NULLIF(cfg.config_data->'symbol_min_volume_share'->>upper(r.symbol),'')::numeric AS symbol_min_volume_share,
      NULLIF(cfg.config_data->'symbol_min_volume_z'->>upper(r.symbol),'')::numeric     AS symbol_min_volume_z,
      NULLIF(cfg.config_data->'symbol_rsi_long_max'->>upper(r.symbol),'')::numeric     AS symbol_rsi_long_max,
      NULLIF(cfg.config_data->'symbol_rsi_short_min'->>upper(r.symbol),'')::numeric    AS symbol_rsi_short_min,
      COALESCE(cfg.config_data->'symbol_exclude', '[]'::jsonb) AS symbol_exclude
  )
  SELECT
    raw.global_min_volume_ratio,
    raw.global_min_volume_share,
    raw.global_min_volume_z,
    raw.global_rsi_long_max,
    raw.global_rsi_short_min,
    raw.symbol_min_volume_ratio,
    raw.symbol_min_volume_share,
    raw.symbol_min_volume_z,
    raw.symbol_rsi_long_max,
    raw.symbol_rsi_short_min,
    raw.symbol_exclude,
    COALESCE(raw.symbol_min_volume_ratio, raw.global_min_volume_ratio) AS eff_min_volume_ratio,
    COALESCE(raw.symbol_min_volume_share, raw.global_min_volume_share) AS eff_min_volume_share,
    COALESCE(raw.symbol_min_volume_z, raw.global_min_volume_z)         AS eff_min_volume_z,
    COALESCE(raw.symbol_rsi_long_max, raw.global_rsi_long_max)         AS eff_rsi_long_max,
    COALESCE(raw.symbol_rsi_short_min, raw.global_rsi_short_min)       AS eff_rsi_short_min,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(raw.symbol_exclude) AS val(txt)
      WHERE upper(split_part(val.txt, ':', 1)) = upper(r.symbol)
        AND (split_part(val.txt, ':', 2) = '' OR upper(split_part(val.txt, ':', 2)) = r.side)
    ) AS ta_symbol_excluded,
    (COALESCE(raw.symbol_min_volume_ratio, raw.global_min_volume_ratio) IS NULL
     OR m.avg_volume_ratio_avg_20 IS NULL
     OR m.avg_volume_ratio_avg_20 >= COALESCE(raw.symbol_min_volume_ratio, raw.global_min_volume_ratio)) AS volume_ratio_pass,
    (COALESCE(raw.symbol_min_volume_share, raw.global_min_volume_share) IS NULL
     OR m.avg_volume_share_20 IS NULL
     OR m.avg_volume_share_20 >= COALESCE(raw.symbol_min_volume_share, raw.global_min_volume_share)) AS volume_share_pass,
    (COALESCE(raw.symbol_min_volume_z, raw.global_min_volume_z) IS NULL
     OR m.avg_volume_zscore_20 IS NULL
     OR m.avg_volume_zscore_20 >= COALESCE(raw.symbol_min_volume_z, raw.global_min_volume_z)) AS volume_z_pass,
    CASE
      WHEN r.side = 'LONG' THEN (
        COALESCE(raw.symbol_rsi_long_max, raw.global_rsi_long_max) IS NULL
        OR m.avg_rsi_14 IS NULL
        OR m.avg_rsi_14 <= COALESCE(raw.symbol_rsi_long_max, raw.global_rsi_long_max)
      )
      WHEN r.side = 'SHORT' THEN (
        COALESCE(raw.symbol_rsi_short_min, raw.global_rsi_short_min) IS NULL
        OR m.avg_rsi_14 IS NULL
        OR m.avg_rsi_14 >= COALESCE(raw.symbol_rsi_short_min, raw.global_rsi_short_min)
      )
      ELSE TRUE
    END AS rsi_pass
  FROM raw
) evals;

COMMENT ON VIEW public.v_live_rules_effective IS 'Live rules augmented with TA heuristics pass/fail diagnostics sourced from reddit_heuristics.ta_config.';