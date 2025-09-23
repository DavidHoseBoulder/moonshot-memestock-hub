\set ON_ERROR_STOP on

\if :{?ENTRY_SESSION}
\else
  \set ENTRY_SESSION 'next_open'
\endif

\echo 'Overlay path: /Users/dhose/Desktop/Moonshot/reddit_work/author-test/overlay_candidates.csv'

DROP TABLE IF EXISTS tmp_overlay_raw;
CREATE TEMP TABLE tmp_overlay_raw (
  variant text,
  trade_date text,
  symbol text,
  side text,
  weight text
);

\copy tmp_overlay_raw FROM '/Users/dhose/Desktop/Moonshot/reddit_work/author-test/overlay_candidates.csv' WITH (FORMAT csv, HEADER true);

DROP TABLE IF EXISTS tmp_overlay;
CREATE TEMP TABLE tmp_overlay AS
SELECT
  trim(variant) AS variant,
  to_date(trim(trade_date), 'YYYY-MM-DD') AS trade_date,
  upper(trim(symbol)) AS symbol,
  upper(trim(side)) AS side,
  CASE WHEN trim(weight) ~ '^-?[0-9]+(\.[0-9]+)?$'
       THEN trim(weight)::numeric
       ELSE NULL::numeric
  END AS weight
FROM tmp_overlay_raw
WHERE trim(variant) <> ''
  AND trim(trade_date) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND trim(symbol) <> ''
  AND trim(side) <> '';

\echo '== Variant coverage =='
SELECT
  variant,
  COUNT(*) AS n_trades,
  COUNT(DISTINCT trade_date) AS n_days,
  ROUND(AVG(weight),6) AS avg_weight,
  ROUND(MIN(weight),6) AS min_weight,
  ROUND(MAX(weight),6) AS max_weight
FROM tmp_overlay
GROUP BY variant
ORDER BY variant;

\echo '\n== Variant by side ==' 
SELECT
  variant,
  side,
  COUNT(*) AS n_trades
FROM tmp_overlay
GROUP BY variant, side
ORDER BY variant, side;

\echo '\n== Daily counts (first 20) =='
SELECT*
FROM (
  SELECT trade_date,
         COUNT(*) FILTER (WHERE variant='base') AS base_trades,
         COUNT(*) FILTER (WHERE variant='align_sym') AS align_sym_trades,
         COUNT(*) FILTER (WHERE variant='align_auth') AS align_auth_trades,
         COUNT(*) FILTER (WHERE variant='block_contra_sym') AS block_contra_sym_trades,
         COUNT(*) FILTER (WHERE variant='block_contra_auth') AS block_contra_auth_trades,
         COUNT(*) FILTER (WHERE variant='weighted_sym') AS weighted_sym_trades,
         COUNT(*) FILTER (WHERE variant='weighted_auth') AS weighted_auth_trades
  FROM tmp_overlay
  GROUP BY trade_date
  ORDER BY trade_date
) d
LIMIT 20;

\echo '\n== Max weight per variant (top 10) =='
SELECT variant, symbol, trade_date, side, weight
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY variant ORDER BY weight DESC NULLS LAST) AS rn
  FROM tmp_overlay
) t
WHERE rn <= 10
ORDER BY variant, weight DESC NULLS LAST;

-- ====================
-- PnL companion summary
-- ====================

DROP TABLE IF EXISTS tmp_overlay_returns;
CREATE TEMP TABLE tmp_overlay_returns AS
WITH bounds AS (
  SELECT MIN(trade_date) AS min_date, MAX(trade_date) AS max_date FROM tmp_overlay
), px AS (
  SELECT
    UPPER(symbol) AS symbol,
    data_date::date AS trade_date,
    price_open::numeric AS price_open,
    price_close::numeric AS price_close,
    LEAD(price_open, 1) OVER (PARTITION BY UPPER(symbol) ORDER BY data_date)  AS open_t1,
    LEAD(price_close, 1) OVER (PARTITION BY UPPER(symbol) ORDER BY data_date) AS close_t1,
    LEAD(price_close, 3) OVER (PARTITION BY UPPER(symbol) ORDER BY data_date) AS close_t3,
    LEAD(price_close, 5) OVER (PARTITION BY UPPER(symbol) ORDER BY data_date) AS close_t5
  FROM enhanced_market_data em
  JOIN bounds b
    ON em.data_date BETWEEN (b.min_date - INTERVAL '1 day') AND (b.max_date + INTERVAL '7 day')
), base AS (
  SELECT o.*, px.price_close AS close_t0, px.open_t1, px.close_t1, px.close_t3, px.close_t5
  FROM tmp_overlay o
  LEFT JOIN px
    ON px.symbol = o.symbol
   AND px.trade_date = o.trade_date
)
SELECT
  variant,
  trade_date,
  symbol,
  side,
  weight,
  1 AS horizon_days,
  CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END AS entry_price,
  close_t1 AS exit_price,
  CASE
    WHEN (CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END) > 0 AND close_t1 > 0
    THEN (close_t1 / (CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END)) - 1 END AS raw_ret,
  CASE
    WHEN (CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END) > 0 AND close_t1 > 0
    THEN ((close_t1 / (CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END)) - 1)
         * CASE WHEN side = 'LONG' THEN 1 ELSE -1 END END AS signed_ret
FROM base
UNION ALL
SELECT
  variant,
  trade_date,
  symbol,
  side,
  weight,
  3 AS horizon_days,
  CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END AS entry_price,
  close_t3 AS exit_price,
  CASE
    WHEN (CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END) > 0 AND close_t3 > 0
    THEN (close_t3 / (CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END)) - 1 END AS raw_ret,
  CASE
    WHEN (CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END) > 0 AND close_t3 > 0
    THEN ((close_t3 / (CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END)) - 1)
         * CASE WHEN side = 'LONG' THEN 1 ELSE -1 END END AS signed_ret
FROM base
UNION ALL
SELECT
  variant,
  trade_date,
  symbol,
  side,
  weight,
  5 AS horizon_days,
  CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END AS entry_price,
  close_t5 AS exit_price,
  CASE
    WHEN (CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END) > 0 AND close_t5 > 0
    THEN (close_t5 / (CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END)) - 1 END AS raw_ret,
  CASE
    WHEN (CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END) > 0 AND close_t5 > 0
    THEN ((close_t5 / (CASE WHEN :'ENTRY_SESSION' = 'same_close' THEN close_t0 ELSE open_t1 END)) - 1)
         * CASE WHEN side = 'LONG' THEN 1 ELSE -1 END END AS signed_ret
FROM base;

\echo '\n== Variant PnL (1/3/5 day horizons) =='
SELECT
  variant,
  horizon_days,
  COUNT(*) FILTER (WHERE signed_ret IS NOT NULL) AS n_trades,
  ROUND(AVG(signed_ret),6) AS avg_excess_ret,
  ROUND(
    SUM(CASE WHEN signed_ret > 0 THEN 1 ELSE 0 END)::numeric /
    NULLIF(COUNT(*) FILTER (WHERE signed_ret IS NOT NULL), 0),
    4
  ) AS win_rate,
  ROUND(
    CASE WHEN STDDEV_POP(signed_ret) > 0 THEN AVG(signed_ret) / NULLIF(STDDEV_POP(signed_ret),0) END,
    4
  ) AS sharpe_like,
  ROUND(
    SUM(weight * signed_ret) /
    NULLIF(SUM(CASE WHEN signed_ret IS NOT NULL THEN weight ELSE 0 END), 0),
    6
  ) AS avg_ret_weighted,
  SUM(CASE WHEN signed_ret IS NOT NULL THEN weight ELSE 0 END) AS total_weight
FROM tmp_overlay_returns
GROUP BY variant, horizon_days
ORDER BY variant, horizon_days;
