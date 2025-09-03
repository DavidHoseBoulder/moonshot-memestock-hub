-- Create view for monitoring signals with duplicate avoidance
CREATE OR REPLACE VIEW v_reddit_monitoring_signals AS
WITH d AS (
  SELECT max(trade_date) AS trade_date
  FROM v_reddit_daily_signals
)
SELECT
  s.symbol,
  s.n_mentions,
  s.avg_score,
  s.used_score,
  s.used_score AS sig_score,  -- compat alias if the UI expects it
  CASE
    WHEN s.used_score >= 0.15 THEN 'Bullish'
    WHEN s.used_score <= -0.15 THEN 'Bearish'
    ELSE 'Neutral'
  END AS sentiment,
  s.trade_date
FROM v_reddit_daily_signals s
JOIN d ON s.trade_date = d.trade_date
ORDER BY abs(s.used_score) DESC, s.n_mentions DESC, s.symbol;