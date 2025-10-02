-- Export hourly Reddit + StockTwits overlap metrics for analysis/backtesting.
-- Usage:
--   psql "$PGURI" -f analysis/stocktwits_hourly_overlap.sql > analysis/stocktwits_hourly_overlap.csv
--   psql "$PGURI" \
--     -v start_ts='2025-09-10 00:00' \
--     -v end_ts='2025-09-27 00:00' \
--     -f analysis/stocktwits_hourly_overlap.sql \
--     > /tmp/stocktwits_hourly_overlap.csv

\if :{?start_ts} \else \set start_ts '' \endif
\if :{?end_ts}   \else \set end_ts ''   \endif

COPY (
WITH params AS (
  SELECT
    COALESCE(NULLIF(:'start_ts','')::timestamptz,
             date_trunc('day', now() AT TIME ZONE 'utc') - INTERVAL '7 days') AS start_ts,
    COALESCE(NULLIF(:'end_ts','')::timestamptz,
             date_trunc('day', now() AT TIME ZONE 'utc') + INTERVAL '1 day') AS end_ts
),
overlap AS (
  SELECT
    hour_bucket,
    symbol,
    reddit_mentions,
    reddit_avg_sentiment,
    reddit_net_sentiment,
    reddit_confidence,
    reddit_engagement,
    reddit_latest_timestamp,
    stocktwits_total_messages,
    stocktwits_sentiment_score,
    stocktwits_net_sentiment,
    stocktwits_confidence_score,
    stocktwits_follower_sum,
    stocktwits_latest_timestamp,
    has_reddit,
    has_stocktwits
  FROM public.v_sentiment_hourly_overlap
)
SELECT
  hour_bucket,
  symbol,
  reddit_mentions,
  reddit_avg_sentiment,
  reddit_net_sentiment,
  reddit_confidence,
  reddit_engagement,
  reddit_latest_timestamp,
  stocktwits_total_messages,
  stocktwits_sentiment_score,
  stocktwits_net_sentiment,
  stocktwits_confidence_score,
  stocktwits_follower_sum,
  stocktwits_latest_timestamp,
  has_reddit,
  has_stocktwits
FROM params, overlap
WHERE hour_bucket >= params.start_ts
  AND hour_bucket <  params.end_ts
ORDER BY hour_bucket DESC, symbol
) TO STDOUT WITH CSV HEADER;
