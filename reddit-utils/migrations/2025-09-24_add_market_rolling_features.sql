-- Drop first so we can extend the column list safely.
DROP VIEW IF EXISTS public.v_market_rolling_features;

-- Create rolling market feature view for TA gates
CREATE VIEW public.v_market_rolling_features AS
WITH base AS (
  SELECT
    upper(symbol) AS symbol,
    data_date::date AS data_date,
    price_close::numeric AS close,
    volume::numeric AS volume,
    lag(price_close) OVER (PARTITION BY upper(symbol) ORDER BY data_date) AS prev_close
  FROM enhanced_market_data
),
calc AS (
  SELECT
    symbol,
    data_date,
    close,
    volume,
    GREATEST(close - prev_close, 0) AS gain,
    GREATEST(prev_close - close, 0) AS loss,
    COUNT(volume) OVER w20 AS cnt_vol_20,
    AVG(volume) OVER w20 AS avg_vol_20,
    MAX(volume) OVER w20 AS max_vol_20,
    STDDEV_SAMP(volume) OVER w20 AS std_vol_20,
    COUNT(close) OVER w14 AS cnt_px_14,
    AVG(GREATEST(close - prev_close, 0)) OVER w14 AS avg_gain_14,
    AVG(GREATEST(prev_close - close, 0)) OVER w14 AS avg_loss_14
  FROM base
  WINDOW
    w20 AS (PARTITION BY symbol ORDER BY data_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW),
    w14 AS (PARTITION BY symbol ORDER BY data_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW)
)
SELECT
  symbol,
  data_date,
  CASE
    WHEN cnt_vol_20 >= 20 AND std_vol_20 IS NOT NULL AND std_vol_20 > 0
      THEN (volume - avg_vol_20) / std_vol_20
    ELSE NULL
  END AS volume_zscore_20,
  CASE
    WHEN cnt_vol_20 >= 5 AND avg_vol_20 IS NOT NULL AND avg_vol_20 > 0
      THEN volume / avg_vol_20
    ELSE NULL
  END AS volume_ratio_avg_20,
  CASE
    WHEN cnt_vol_20 >= 5 AND max_vol_20 IS NOT NULL AND max_vol_20 > 0
      THEN volume / max_vol_20
    ELSE NULL
  END AS volume_share_20,
  CASE
    WHEN cnt_px_14 < 14 THEN NULL
    WHEN avg_loss_14 = 0 AND avg_gain_14 = 0 THEN NULL
    WHEN avg_loss_14 = 0 THEN 100
    ELSE 100 - (100 / (1 + (avg_gain_14 / NULLIF(avg_loss_14,0))))
  END AS rsi_14
FROM calc;
