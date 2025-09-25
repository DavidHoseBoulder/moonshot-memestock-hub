-- Creates a daily StockTwits rollup view and a combined Reddit/StockTwits coverage view

CREATE OR REPLACE VIEW public.v_stocktwits_daily_signals AS
WITH ranked AS (
    SELECT
        date_trunc('day', collected_at)::date AS trade_date,
        upper(symbol) AS symbol,
        sentiment_score,
        confidence_score,
        metadata,
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
    COALESCE((metadata->'stats'->>'total_messages')::int,
             CASE WHEN metadata ? 'messages' THEN jsonb_array_length(metadata->'messages') ELSE 0 END,
             0) AS total_messages,
    COALESCE((metadata->'stats'->>'bullish_messages')::int, 0) AS bullish_messages,
    COALESCE((metadata->'stats'->>'bearish_messages')::int, 0) AS bearish_messages,
    COALESCE((metadata->'stats'->>'neutral_messages')::int, 0) AS neutral_messages,
    COALESCE((metadata->'stats'->>'bullish_ratio')::numeric, 0) AS bullish_ratio,
    COALESCE(sentiment_score, 0) AS sentiment_score,
    COALESCE(confidence_score, 0) AS confidence_score
FROM ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW public.v_sentiment_daily_overlap AS
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
        sentiment_score,
        confidence_score
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
    s.sentiment_score AS stocktwits_sentiment_score,
    s.confidence_score AS stocktwits_confidence_score,
    (r.symbol IS NOT NULL) AS has_reddit,
    (s.symbol IS NOT NULL) AS has_stocktwits
FROM reddit r
FULL OUTER JOIN stocktwits s
    ON r.trade_date = s.trade_date
   AND r.symbol = s.symbol;
