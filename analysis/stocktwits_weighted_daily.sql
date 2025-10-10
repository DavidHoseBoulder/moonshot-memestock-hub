-- stocktwits_weighted_daily.sql
-- Aggregate StockTwits sentiment into simple and follower-weighted scores per (day, symbol).
-- Usage example:
--   psql "$PGURI" \
--     -v start_date='2025-09-08' \
--     -v end_date='2025-09-30' \
--     -v max_followers=10000 \
--     -f analysis/stocktwits_weighted_daily.sql
--
-- Columns returned:
--   trade_date, symbol, st_messages, follower_sum, st_simple_avg, st_weighted_avg

\if :{?start_date} \else \set start_date '' \endif
\if :{?end_date} \else \set end_date '' \endif
\if :{?max_followers} \else \set max_followers 10000 \endif

WITH params AS (
  SELECT
    COALESCE(NULLIF(:'start_date','')::date, DATE '1970-01-01') AS start_date,
    COALESCE(NULLIF(:'end_date','')::date, (now() at time zone 'utc')::date + 1) AS end_date_exclusive,
    (:max_followers)::int AS max_followers
),
raw AS (
  SELECT
    sh.collected_at::date AS trade_date,
    upper(sh.symbol)       AS symbol,
    COALESCE(msg->'entities'->'sentiment'->>'basic', msg->'sentiment'->>'basic') AS label,
    LEAST(GREATEST(COALESCE((msg->'user'->>'followers')::int, 0), 0), params.max_followers) AS followers
  FROM sentiment_history sh
  CROSS JOIN LATERAL jsonb_array_elements(sh.metadata->'messages') msg
  CROSS JOIN params
  WHERE sh.source = 'stocktwits'
    AND sh.collected_at >= params.start_date
    AND sh.collected_at < params.end_date_exclusive
),
agg AS (
  SELECT
    trade_date,
    symbol,
    COUNT(*) AS st_messages,
    SUM(followers) AS follower_sum,
    AVG(CASE WHEN label = 'Bullish' THEN 1 WHEN label = 'Bearish' THEN -1 ELSE 0 END)::numeric AS st_simple_avg,
    CASE
      WHEN SUM(NULLIF(followers,0)) > 0
        THEN SUM(CASE WHEN label = 'Bullish' THEN 1 WHEN label = 'Bearish' THEN -1 ELSE 0 END * followers)::numeric
             / SUM(NULLIF(followers,0))
      ELSE NULL
    END AS st_weighted_avg
  FROM raw
  GROUP BY 1,2
)
SELECT *
FROM agg
ORDER BY trade_date, symbol;
