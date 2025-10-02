-- Refresh StockTwits daily signals with richer rollups and add an hourly overlap view

DROP VIEW IF EXISTS public.v_sentiment_hourly_overlap;
DROP VIEW IF EXISTS public.v_sentiment_daily_overlap;
DROP VIEW IF EXISTS public.v_stocktwits_daily_signals;

CREATE VIEW public.v_stocktwits_daily_signals AS
WITH ranked AS (
    SELECT
        date_trunc('day', collected_at)::date AS trade_date,
        upper(symbol) AS symbol,
        sentiment_score,
        raw_sentiment,
        confidence_score,
        volume_indicator,
        engagement_score,
        metadata,
        collected_at,
        ROW_NUMBER() OVER (
            PARTITION BY upper(symbol), date_trunc('day', collected_at)
            ORDER BY collected_at DESC
        ) AS rn
    FROM public.sentiment_history
    WHERE source = 'stocktwits'
)
SELECT
    trade_date,
    symbol,
    COALESCE(
        volume_indicator,
        (metadata->'stats'->>'total_messages')::int,
        CASE WHEN metadata ? 'messages' THEN jsonb_array_length(metadata->'messages') ELSE 0 END,
        0
    ) AS total_messages,
    COALESCE((metadata->'stats'->>'bullish_messages')::int, 0) AS bullish_messages,
    COALESCE((metadata->'stats'->>'bearish_messages')::int, 0) AS bearish_messages,
    COALESCE((metadata->'stats'->>'neutral_messages')::int, 0) AS neutral_messages,
    COALESCE((metadata->'stats'->>'bullish_ratio')::numeric, 0) AS bullish_ratio,
    COALESCE((metadata->'stats'->>'bearish_ratio')::numeric, 0) AS bearish_ratio,
    COALESCE(sentiment_score, 0) AS sentiment_score,
    COALESCE(raw_sentiment, (metadata->'stats'->>'net_sentiment')::numeric, 0) AS net_sentiment,
    COALESCE(confidence_score, 0) AS confidence_score,
    COALESCE(
        engagement_score,
        (metadata->'stats'->>'follower_sum')::numeric,
        0
    ) AS follower_sum,
    COALESCE((metadata->>'sample_size')::int, 0) AS sample_size,
    COALESCE((metadata->>'messages_truncated')::boolean, false) AS messages_truncated,
    collected_at AS last_collected_at
FROM ranked
WHERE rn = 1;

CREATE VIEW public.v_sentiment_daily_overlap AS
WITH reddit AS (
    SELECT
        trade_date,
        upper(symbol) AS symbol,
        n_mentions,
        avg_score,
        used_score
    FROM public.v_reddit_daily_signals
),
stocktwits AS (
    SELECT
        trade_date,
        symbol,
        total_messages,
        bullish_messages,
        bearish_messages,
        neutral_messages,
        bullish_ratio,
        bearish_ratio,
        sentiment_score,
        net_sentiment,
        confidence_score,
        follower_sum,
        sample_size,
        messages_truncated
    FROM public.v_stocktwits_daily_signals
)
SELECT
    COALESCE(r.trade_date, s.trade_date) AS trade_date,
    COALESCE(r.symbol, s.symbol) AS symbol,
    r.n_mentions AS reddit_n_mentions,
    r.avg_score AS reddit_avg_score,
    r.used_score AS reddit_used_score,
    s.total_messages AS stocktwits_total_messages,
    s.bullish_messages AS stocktwits_bullish_messages,
    s.bearish_messages AS stocktwits_bearish_messages,
    s.neutral_messages AS stocktwits_neutral_messages,
    s.bullish_ratio AS stocktwits_bullish_ratio,
    s.bearish_ratio AS stocktwits_bearish_ratio,
    s.sentiment_score AS stocktwits_sentiment_score,
    s.net_sentiment AS stocktwits_net_sentiment,
    s.confidence_score AS stocktwits_confidence_score,
    s.follower_sum AS stocktwits_follower_sum,
    s.sample_size AS stocktwits_sample_size,
    s.messages_truncated AS stocktwits_messages_truncated,
    (r.symbol IS NOT NULL) AS has_reddit,
    (s.symbol IS NOT NULL) AS has_stocktwits
FROM reddit r
FULL OUTER JOIN stocktwits s
    ON r.trade_date = s.trade_date
   AND r.symbol = s.symbol;

CREATE VIEW public.v_sentiment_hourly_overlap AS
WITH reddit_hourly AS (
    SELECT
        date_trunc('hour', data_timestamp AT TIME ZONE 'utc') AS hour_bucket,
        upper(symbol) AS symbol,
        SUM(COALESCE(volume_indicator, 1)) AS reddit_mentions,
        AVG(COALESCE(sentiment_score, raw_sentiment, 0)) AS reddit_avg_sentiment,
        AVG(COALESCE(raw_sentiment, sentiment_score, 0)) AS reddit_net_sentiment,
        MAX(COALESCE(confidence_score, 0)) AS reddit_confidence,
        SUM(COALESCE(engagement_score, 0)) AS reddit_engagement,
        MAX(data_timestamp) AS reddit_latest_timestamp
    FROM public.sentiment_history
    WHERE source = 'reddit'
    GROUP BY 1, 2
),
stocktwits_hourly AS (
    SELECT
        date_trunc('hour', data_timestamp AT TIME ZONE 'utc') AS hour_bucket,
        upper(symbol) AS symbol,
        SUM(COALESCE(volume_indicator, 0)) AS stocktwits_total_messages,
        AVG(COALESCE(sentiment_score, 0)) AS stocktwits_sentiment_score,
        AVG(COALESCE(raw_sentiment, 0)) AS stocktwits_net_sentiment,
        MAX(COALESCE(confidence_score, 0)) AS stocktwits_confidence_score,
        SUM(COALESCE(engagement_score, 0)) AS stocktwits_follower_sum,
        MAX(data_timestamp) AS stocktwits_latest_timestamp
    FROM public.sentiment_history
    WHERE source = 'stocktwits'
    GROUP BY 1, 2
)
SELECT
    COALESCE(r.hour_bucket, s.hour_bucket) AS hour_bucket,
    COALESCE(r.symbol, s.symbol) AS symbol,
    r.reddit_mentions,
    r.reddit_avg_sentiment,
    r.reddit_net_sentiment,
    r.reddit_confidence,
    r.reddit_engagement,
    r.reddit_latest_timestamp,
    s.stocktwits_total_messages,
    s.stocktwits_sentiment_score,
    s.stocktwits_net_sentiment,
    s.stocktwits_confidence_score,
    s.stocktwits_follower_sum,
    s.stocktwits_latest_timestamp,
    (r.symbol IS NOT NULL) AS has_reddit,
    (s.symbol IS NOT NULL) AS has_stocktwits
FROM reddit_hourly r
FULL OUTER JOIN stocktwits_hourly s
    ON r.hour_bucket = s.hour_bucket
   AND r.symbol = s.symbol;

GRANT SELECT ON public.v_sentiment_hourly_overlap TO authenticated;
