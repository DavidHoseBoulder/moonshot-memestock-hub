-- Refresh StockTwits daily views with explicit STAT/SIMPLE/WEIGHTED aliases
-- Allows downstream clients (Lovable, backtests) to consume consistent column names

BEGIN;

DROP VIEW IF EXISTS public.v_sentiment_daily_overlap;
DROP VIEW IF EXISTS public.v_stocktwits_daily_signals;

CREATE VIEW public.v_stocktwits_daily_signals AS
WITH params AS (
    SELECT 10000 AS max_followers
), ranked AS (
    SELECT
        date_trunc('day', sh.collected_at)::date AS trade_date,
        upper(sh.symbol) AS symbol,
        sh.sentiment_score,
        sh.confidence_score,
        sh.metadata,
        row_number() OVER (
            PARTITION BY upper(sh.symbol), date_trunc('day', sh.collected_at)
            ORDER BY sh.collected_at DESC
        ) AS rn
    FROM sentiment_history sh
    WHERE sh.source = 'stocktwits'
), stats AS (
    SELECT
        r.trade_date,
        r.symbol,
        COALESCE(
            ((r.metadata -> 'stats') ->> 'total_messages')::integer,
            CASE WHEN r.metadata ? 'messages' THEN jsonb_array_length(r.metadata -> 'messages') ELSE 0 END,
            0
        ) AS total_messages,
        COALESCE(((r.metadata -> 'stats') ->> 'bullish_messages')::integer, 0) AS bullish_messages,
        COALESCE(((r.metadata -> 'stats') ->> 'bearish_messages')::integer, 0) AS bearish_messages,
        COALESCE(((r.metadata -> 'stats') ->> 'neutral_messages')::integer, 0) AS neutral_messages,
        COALESCE(((r.metadata -> 'stats') ->> 'bullish_ratio')::numeric, 0::numeric) AS bullish_ratio,
        COALESCE(r.sentiment_score, 0::numeric) AS sentiment_score,
        COALESCE(r.confidence_score, 0::numeric) AS confidence_score
    FROM ranked r
    WHERE r.rn = 1
), raw AS (
    SELECT
        sh.collected_at::date AS trade_date,
        upper(sh.symbol) AS symbol,
        COALESCE(
            (msg.value -> 'entities' -> 'sentiment' ->> 'basic'),
            (msg.value -> 'sentiment' ->> 'basic')
        ) AS label,
        LEAST(
            GREATEST(COALESCE((msg.value -> 'user' ->> 'followers')::integer, 0), 0),
            params.max_followers
        ) AS followers
    FROM sentiment_history sh
    CROSS JOIN params
    CROSS JOIN LATERAL jsonb_array_elements(sh.metadata -> 'messages') msg(value)
    WHERE sh.source = 'stocktwits'
), weighted AS (
    SELECT
        r.trade_date,
        r.symbol,
        SUM(r.followers)::bigint AS follower_sum,
        AVG(
            CASE
                WHEN r.label = 'BULLISH' THEN 1
                WHEN r.label = 'BEARISH' THEN -1
                ELSE 0
            END
        )::numeric AS st_simple_avg,
        CASE
            WHEN SUM(NULLIF(r.followers, 0)) > 0 THEN
                SUM(
                    CASE
                        WHEN r.label = 'BULLISH' THEN 1
                        WHEN r.label = 'BEARISH' THEN -1
                        ELSE 0
                    END * r.followers
                )::numeric / SUM(NULLIF(r.followers, 0))::numeric
            ELSE NULL::numeric
        END AS st_weighted_avg
    FROM raw r
    GROUP BY r.trade_date, r.symbol
)
SELECT
    s.trade_date,
    s.symbol,
    s.total_messages,
    s.bullish_messages,
    s.bearish_messages,
    s.neutral_messages,
    s.bullish_ratio,
    s.sentiment_score,
    s.confidence_score,
    w.follower_sum,
    w.st_simple_avg,
    w.st_weighted_avg,
    -- alias columns for downstream consistency
    s.sentiment_score AS stocktwits_stat_score,
    w.st_simple_avg   AS stocktwits_simple_score,
    w.st_weighted_avg AS stocktwits_weighted_score,
    w.follower_sum    AS stocktwits_follower_sum
FROM stats s
LEFT JOIN weighted w
    ON s.trade_date = w.trade_date
   AND s.symbol     = w.symbol;

CREATE VIEW public.v_sentiment_daily_overlap AS
WITH reddit AS (
    SELECT
        v.trade_date,
        upper(v.symbol) AS symbol,
        v.n_mentions,
        v.avg_score,
        v.used_score
    FROM v_reddit_daily_signals v
), stocktwits AS (
    SELECT
        vs.trade_date,
        vs.symbol,
        vs.total_messages,
        vs.bullish_messages,
        vs.bearish_messages,
        vs.neutral_messages,
        vs.bullish_ratio,
        vs.sentiment_score,
        vs.confidence_score,
        vs.follower_sum,
        vs.st_simple_avg,
        vs.st_weighted_avg,
        vs.stocktwits_stat_score,
        vs.stocktwits_simple_score,
        vs.stocktwits_weighted_score,
        vs.stocktwits_follower_sum
    FROM v_stocktwits_daily_signals vs
)
SELECT
    COALESCE(r.trade_date, s.trade_date) AS trade_date,
    COALESCE(r.symbol, s.symbol)         AS symbol,
    r.n_mentions                         AS reddit_n_mentions,
    r.avg_score                          AS reddit_avg_score,
    r.used_score                         AS reddit_used_score,
    s.total_messages                     AS stocktwits_total_messages,
    s.bullish_messages                   AS stocktwits_bullish_messages,
    s.bearish_messages                   AS stocktwits_bearish_messages,
    s.neutral_messages                   AS stocktwits_neutral_messages,
    s.bullish_ratio                      AS stocktwits_bullish_ratio,
    s.sentiment_score                    AS stocktwits_sentiment_score,
    s.confidence_score                   AS stocktwits_confidence_score,
    s.stocktwits_follower_sum            AS stocktwits_follower_sum,
    s.stocktwits_simple_score            AS stocktwits_simple_score,
    s.stocktwits_weighted_score          AS stocktwits_weighted_score,
    s.stocktwits_stat_score              AS stocktwits_stat_score,
    r.symbol IS NOT NULL                 AS has_reddit,
    s.symbol IS NOT NULL                 AS has_stocktwits
FROM reddit r
FULL JOIN stocktwits s
  ON r.trade_date = s.trade_date
 AND r.symbol     = s.symbol;

COMMIT;
