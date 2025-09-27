-- stocktwits_reddit_correlations.sql
-- Run with: psql "$PGURI" -f analysis/stocktwits_reddit_correlations.sql
-- Produces three result sets: polarity agreement, follower-weighted correlation,
-- and placeholder join against price data (commented until price table confirmed).

DROP TABLE IF EXISTS tmp_joined_daily;

CREATE TEMP TABLE tmp_joined_daily AS
WITH joined_messages AS (
  SELECT
    sh.collected_at::date AS day,
    sh.symbol,
    (msg->>'id')::bigint                 AS st_message_id,
    (msg->>'created_at')::timestamptz    AS st_created_at,
    COALESCE(
      msg->'entities'->'sentiment'->>'basic',
      msg->'sentiment'->>'basic'
    )                                   AS st_label,
    LEAST(GREATEST((msg->'user'->>'followers')::int, 0), 10000) AS st_followers_capped,
    CASE
      WHEN COALESCE(msg->'entities'->'sentiment'->>'basic', msg->'sentiment'->>'basic') = 'Bullish' THEN 1
      WHEN COALESCE(msg->'entities'->'sentiment'->>'basic', msg->'sentiment'->>'basic') = 'Bearish' THEN -1
      ELSE 0
    END                                   AS st_sentiment_numeric,
    ROW_NUMBER() OVER (
      PARTITION BY sh.collected_at::date, sh.symbol
      ORDER BY (msg->>'created_at')::timestamptz DESC
    ) AS rn
  FROM sentiment_history sh
  CROSS JOIN LATERAL jsonb_array_elements(sh.metadata->'messages') msg
  WHERE sh.source = 'stocktwits'
    AND sh.collected_at >= '2025-09-18'::date
    AND sh.collected_at <  '2025-09-27'::date
),
stocktwits_daily AS (
  SELECT
    day,
    symbol,
    AVG(st_sentiment_numeric)                    AS st_avg_sentiment,
    SUM(st_sentiment_numeric * st_followers_capped)::numeric
      / NULLIF(SUM(NULLIF(st_followers_capped,0)),0)            AS st_weighted_sentiment,
    SUM(CASE WHEN st_sentiment_numeric = 1 THEN 1 ELSE 0 END)   AS st_bullish_msgs,
    SUM(CASE WHEN st_sentiment_numeric = -1 THEN 1 ELSE 0 END)  AS st_bearish_msgs
  FROM joined_messages
  GROUP BY 1, 2
),
reddit_daily AS (
  SELECT
    date_trunc('day', m.created_utc)::date AS day,
    m.symbol,
    COUNT(*)                                AS reddit_mentions,
    SUM(CASE s.label WHEN 'pos' THEN 1 WHEN 'neg' THEN -1 ELSE 0 END) AS reddit_net_sentiment,
    AVG(s.score)                            AS reddit_avg_score,
    SUM(CASE WHEN s.label = 'pos' THEN 1 ELSE 0 END) AS reddit_pos,
    SUM(CASE WHEN s.label = 'neg' THEN 1 ELSE 0 END) AS reddit_neg
  FROM reddit_mentions m
  JOIN reddit_sentiment s ON s.mention_id = m.mention_id
  WHERE m.created_utc >= '2025-09-18'::timestamptz
    AND m.created_utc <  '2025-09-27'::timestamptz
  GROUP BY 1, 2
)
SELECT
  sd.day,
  sd.symbol,
  sd.st_avg_sentiment,
  sd.st_weighted_sentiment,
  sd.st_bullish_msgs,
  sd.st_bearish_msgs,
  rd.reddit_mentions,
  rd.reddit_net_sentiment,
  rd.reddit_avg_score,
  rd.reddit_pos,
  rd.reddit_neg
FROM stocktwits_daily sd
JOIN reddit_daily rd USING (day, symbol);

-- Result set 1: polarity agreement buckets ---------------------------------
SELECT
  CASE
    WHEN st_avg_sentiment > 0 AND reddit_net_sentiment > 0 THEN 'Both Bullish'
    WHEN st_avg_sentiment < 0 AND reddit_net_sentiment < 0 THEN 'Both Bearish'
    WHEN st_avg_sentiment = 0 AND reddit_net_sentiment = 0 THEN 'Both Neutral'
    WHEN st_avg_sentiment > 0 AND reddit_net_sentiment <= 0 THEN 'ST Bullish / Reddit Non-Pos'
    WHEN st_avg_sentiment < 0 AND reddit_net_sentiment >= 0 THEN 'ST Bearish / Reddit Non-Neg'
    ELSE 'Mixed'
  END AS agreement_bucket,
  COUNT(*)                                AS ticker_days,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct_of_total
FROM tmp_joined_daily
GROUP BY 1
ORDER BY pct_of_total DESC;

-- Result set 2: follower-weighted vs Reddit average score correlation --------
SELECT
  COUNT(*) AS ticker_days,
  ROUND(CORR(st_weighted_sentiment, reddit_avg_score)::numeric, 3) AS corr_weighted_vs_reddit,
  ROUND(CORR(st_avg_sentiment, reddit_avg_score)::numeric, 3)       AS corr_simple_vs_reddit,
  ROUND(AVG(st_weighted_sentiment)::numeric, 3)                     AS avg_st_weighted,
  ROUND(AVG(reddit_avg_score)::numeric, 3)                          AS avg_reddit_score
FROM tmp_joined_daily
WHERE st_weighted_sentiment IS NOT NULL
  AND reddit_avg_score IS NOT NULL;

-- Result set 3: price-change join (uncomment/edit once price table confirmed) -
-- Example assumes a table `equity_price_eod(symbol, trade_date, close, next_close)`
-- providing daily close and next-day close for return calc.
--
-- SELECT
--   jd.day,
--   jd.symbol,
--   jd.st_weighted_sentiment,
--   jd.reddit_avg_score,
--   ep.close,
--   ep.next_close,
--   (ep.next_close - ep.close) / NULLIF(ep.close,0) AS next_day_return
-- FROM tmp_joined_daily jd
-- JOIN equity_price_eod ep
--   ON ep.symbol = jd.symbol AND ep.trade_date = jd.day;
