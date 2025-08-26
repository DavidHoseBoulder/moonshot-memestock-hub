-- Create standardized views for Reddit sentiment system

-- 1. v_daily_scores - Daily sentiment scores
CREATE OR REPLACE VIEW v_daily_scores AS
SELECT 
  trade_date::date AS data_date,
  UPPER(symbol) AS symbol,
  n_mentions::integer AS n_mentions,
  avg_score::numeric AS avg_score,
  0::numeric AS velocity,
  used_score::numeric AS used_score,
  now() AS generated_at
FROM v_reddit_daily_signals
WHERE trade_date IS NOT NULL AND symbol IS NOT NULL;

-- 2. v_today_candidates - Today's candidate trades
CREATE OR REPLACE VIEW v_today_candidates AS
SELECT 
  trade_date::date AS trade_date,
  UPPER(symbol) AS symbol,
  horizon::text AS horizon,
  n_mentions::integer AS n_mentions,
  used_score::numeric AS used_score,
  min_mentions::integer AS min_mentions,
  pos_thresh::numeric AS pos_thresh,
  use_weighted::boolean AS use_weighted,
  triggered::boolean AS triggered,
  NULL::integer AS priority,
  COALESCE(side, 'LONG')::text AS side
FROM v_reddit_candidates_today
WHERE trade_date IS NOT NULL AND symbol IS NOT NULL;

-- 3. v_today_recommendations - Today's triggered recommendations
CREATE OR REPLACE VIEW v_today_recommendations AS
SELECT 
  d::date AS trade_date,
  UPPER(symbol) AS symbol,
  horizon::text AS horizon,
  COALESCE(side, 'LONG')::text AS side,
  n_mentions::integer AS n_mentions,
  sig_score::numeric AS used_score,
  pos_thresh::numeric AS pos_thresh,
  triggered::boolean AS triggered,
  NULL::integer AS priority,
  NULL::text AS backtest_key,
  0::numeric AS composite_score,
  0::numeric AS sharpe
FROM v_live_sentiment_signals
WHERE d IS NOT NULL AND symbol IS NOT NULL AND triggered = true
UNION ALL
SELECT 
  trade_date::date AS trade_date,
  UPPER(symbol) AS symbol,
  horizon::text AS horizon,
  COALESCE(side, 'LONG')::text AS side,
  n_mentions::integer AS n_mentions,
  used_score::numeric AS used_score,
  pos_thresh::numeric AS pos_thresh,
  triggered::boolean AS triggered,
  NULL::integer AS priority,
  NULL::text AS backtest_key,
  0::numeric AS composite_score,
  0::numeric AS sharpe
FROM v_reddit_candidates_today
WHERE trade_date IS NOT NULL AND symbol IS NOT NULL AND triggered = true;

-- 4. v_backtest_summary - Backtest performance summary
CREATE OR REPLACE VIEW v_backtest_summary AS
SELECT 
  UPPER(symbol) AS symbol,
  horizon::text AS horizon,
  avg_ret::numeric AS avg_ret,
  median_ret::numeric AS median_ret,
  hit_rate::numeric AS win_rate,
  sharpe::numeric AS sharpe,
  trades::integer AS trades,
  COALESCE(
    composite_score,
    (COALESCE(avg_ret, 0) + COALESCE(median_ret, avg_ret, 0))/2 * COALESCE(hit_rate, 0)
  )::numeric AS composite_score
FROM v_reddit_backtest_lookup
WHERE symbol IS NOT NULL AND horizon IS NOT NULL
UNION ALL
SELECT 
  UPPER(symbol) AS symbol,
  horizon::text AS horizon,
  avg_ret::numeric AS avg_ret,
  median_ret::numeric AS median_ret,
  win_rate::numeric AS win_rate,
  sharpe::numeric AS sharpe,
  trades::integer AS trades,
  COALESCE(
    (avg_ret + COALESCE(median_ret, avg_ret))/2 * win_rate,
    0
  )::numeric AS composite_score
FROM backtest_sweep_results
WHERE symbol IS NOT NULL AND horizon IS NOT NULL;

COMMENT ON VIEW v_daily_scores IS 'Standardized daily Reddit sentiment scores';
COMMENT ON VIEW v_today_candidates IS 'Standardized today candidate trades';
COMMENT ON VIEW v_today_recommendations IS 'Standardized today triggered recommendations';
COMMENT ON VIEW v_backtest_summary IS 'Standardized backtest performance summary';