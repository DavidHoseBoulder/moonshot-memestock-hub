-- stocktwits_reddit_features.sql
-- Export daily Reddit + StockTwits sentiment metrics with optional weighting and price joins.
--
-- Usage examples:
--   # default window: last 14 days ending today (UTC)
--   psql "$PGURI" -f analysis/stocktwits_reddit_features.sql
--
--   # explicit window + weights, export to CSV
--   psql "$PGURI" \
--     -v start_date='2025-09-01' \
--     -v end_date='2025-09-27'   \
--     -v reddit_weight=0.7       \
--     -v stocktwits_weight=0.3   \
--     -f analysis/stocktwits_reddit_features.sql \
--     \g /tmp/stocktwits_features.csv
--
-- Variables (all optional):
--   start_date        inclusive YYYY-MM-DD (default: today-14d)
--   end_date          exclusive YYYY-MM-DD (default: today+1)
--   reddit_weight     numeric weight applied to Reddit scores (default: 1.0)
--   stocktwits_weight numeric weight applied to StockTwits scores (default: 0.0)

\if :{?start_date} \else \set start_date '' \endif
\if :{?end_date} \else \set end_date '' \endif
\if :{?reddit_weight} \else \set reddit_weight '' \endif
\if :{?stocktwits_weight} \else \set stocktwits_weight '' \endif

WITH params AS (
  SELECT
    COALESCE(NULLIF(:'start_date', '')::date,
             (now() AT TIME ZONE 'utc')::date - 14)                               AS start_date,
    COALESCE(NULLIF(:'end_date', '')::date,
             (now() AT TIME ZONE 'utc')::date + 1)                                AS end_date_exclusive,
    COALESCE(NULLIF(:'reddit_weight', '')::numeric, 1.0)                          AS w_reddit,
    COALESCE(NULLIF(:'stocktwits_weight', '')::numeric, 0.0)                      AS w_stocktwits
),
reddit AS (
  SELECT
    m.created_utc::date                          AS trade_date,
    upper(m.symbol)                              AS symbol,
    COUNT(*)                                     AS reddit_mentions,
    AVG(s.score)::numeric                        AS reddit_avg_score,
    AVG(ABS(s.score))::numeric                   AS reddit_avg_abs,
    SUM((s.score > 0)::int)::numeric             AS reddit_pos_mentions,
    SUM((s.score < 0)::int)::numeric             AS reddit_neg_mentions,
    MIN(m.created_utc)                           AS reddit_first_ts
  FROM params, reddit_mentions m
  JOIN reddit_sentiment s ON s.mention_id = m.mention_id
  WHERE m.created_utc >= params.start_date
    AND m.created_utc <  params.end_date_exclusive
  GROUP BY 1,2
),
stocktwits AS (
  SELECT
    sub.collected_at::date                       AS trade_date,
    upper(sub.symbol)                            AS symbol,
    COUNT(*)::numeric                            AS st_mentions,
    SUM(CASE WHEN label = 'Bullish' THEN 1 ELSE 0 END)::numeric AS st_pos_messages,
    SUM(CASE WHEN label = 'Bearish' THEN 1 ELSE 0 END)::numeric AS st_neg_messages,
    AVG(sentiment_numeric)::numeric              AS st_sentiment_score,
    MIN(created_ts)                              AS st_first_ts
  FROM (
    SELECT
      sh.collected_at,
      sh.symbol,
      (msg->>'created_at')::timestamptz AS created_ts,
      COALESCE(msg->'entities'->'sentiment'->>'basic', msg->'sentiment'->>'basic') AS label,
      CASE
        WHEN COALESCE(msg->'entities'->'sentiment'->>'basic', msg->'sentiment'->>'basic') = 'Bullish' THEN 1
        WHEN COALESCE(msg->'entities'->'sentiment'->>'basic', msg->'sentiment'->>'basic') = 'Bearish' THEN -1
        ELSE 0
      END AS sentiment_numeric
    FROM params, sentiment_history sh
    CROSS JOIN LATERAL jsonb_array_elements(sh.metadata->'messages') msg
    WHERE sh.source = 'stocktwits'
      AND sh.collected_at >= params.start_date
      AND sh.collected_at <  params.end_date_exclusive
  ) sub
  GROUP BY 1,2
),
prices AS (
  SELECT
    symbol,
    date_trunc('day', d)::date AS trade_date,
    close::numeric             AS close,
    LEAD(close) OVER (PARTITION BY symbol ORDER BY d)::numeric AS next_close
  FROM prices_daily
),
joined AS (
  SELECT
    COALESCE(r.trade_date, s.trade_date) AS trade_date,
    COALESCE(r.symbol, s.symbol)         AS symbol,
    COALESCE(r.reddit_mentions, 0)       AS reddit_mentions,
    COALESCE(r.reddit_avg_score, 0)      AS reddit_avg_score,
    COALESCE(r.reddit_avg_abs, 0)        AS reddit_avg_abs,
    COALESCE(r.reddit_pos_mentions, 0)   AS reddit_pos_mentions,
    COALESCE(r.reddit_neg_mentions, 0)   AS reddit_neg_mentions,
    COALESCE(r.reddit_first_ts, NULL)    AS reddit_first_ts,
    COALESCE(s.st_mentions, 0)           AS st_mentions,
    COALESCE(s.st_pos_messages, 0)       AS st_pos_messages,
    COALESCE(s.st_neg_messages, 0)       AS st_neg_messages,
    COALESCE(s.st_sentiment_score, 0)    AS st_sentiment_score,
    COALESCE(s.st_first_ts, NULL)        AS st_first_ts
  FROM reddit r
  FULL OUTER JOIN stocktwits s USING (trade_date, symbol)
)
SELECT
  j.trade_date,
  j.symbol,
  j.reddit_mentions,
  j.reddit_avg_score,
  j.reddit_avg_abs,
  j.reddit_pos_mentions,
  j.reddit_neg_mentions,
  j.reddit_first_ts,
  j.st_mentions,
  j.st_sentiment_score,
  j.st_pos_messages,
  j.st_neg_messages,
  j.st_first_ts,
  (EXTRACT(EPOCH FROM (j.st_first_ts - j.reddit_first_ts)) / 60.0)::numeric AS stocktwits_leads_minutes,
  (EXTRACT(EPOCH FROM (j.reddit_first_ts - j.st_first_ts)) / 60.0)::numeric AS reddit_leads_minutes,
  -- blended metrics
  CASE
    WHEN denom_weighted > 0 THEN blended_avg
    ELSE COALESCE(j.reddit_avg_score, j.st_sentiment_score)
  END AS blended_score,
  CASE
    WHEN denom_weighted > 0 THEN blended_abs
    ELSE COALESCE(j.reddit_avg_abs, ABS(j.st_sentiment_score))
  END AS blended_abs,
  CASE
    WHEN total_mentions > 0 THEN total_pos::numeric / total_mentions
    ELSE 0
  END AS blended_pos_rate,
  CASE
    WHEN total_mentions > 0 THEN total_neg::numeric / total_mentions
    ELSE 0
  END AS blended_neg_rate,
  total_mentions,
  p.close,
  p.next_close,
  CASE WHEN p.next_close IS NOT NULL AND p.close <> 0
       THEN (p.next_close - p.close) / p.close
       ELSE NULL
  END AS next_day_return
FROM (
  SELECT
    j.*,
    (COALESCE(j.reddit_mentions,0) + COALESCE(j.st_mentions,0))              AS total_mentions,
    (COALESCE(j.reddit_pos_mentions,0) + COALESCE(j.st_pos_messages,0))      AS total_pos,
    (COALESCE(j.reddit_neg_mentions,0) + COALESCE(j.st_neg_messages,0))      AS total_neg,
    (params.w_reddit * COALESCE(j.reddit_mentions,0) +
     params.w_stocktwits * COALESCE(j.st_mentions,0))                       AS denom_weighted,
    CASE
      WHEN (params.w_reddit * COALESCE(j.reddit_mentions,0) +
            params.w_stocktwits * COALESCE(j.st_mentions,0)) > 0
      THEN (
        params.w_reddit * COALESCE(j.reddit_avg_score,0) * COALESCE(j.reddit_mentions,0) +
        params.w_stocktwits * COALESCE(j.st_sentiment_score,0) * COALESCE(j.st_mentions,0)
      ) / (params.w_reddit * COALESCE(j.reddit_mentions,0) +
            params.w_stocktwits * COALESCE(j.st_mentions,0))
      ELSE NULL
    END AS blended_avg,
    CASE
      WHEN (params.w_reddit * COALESCE(j.reddit_mentions,0) +
            params.w_stocktwits * COALESCE(j.st_mentions,0)) > 0
      THEN (
        params.w_reddit * COALESCE(j.reddit_avg_abs,0) * COALESCE(j.reddit_mentions,0) +
        params.w_stocktwits * ABS(COALESCE(j.st_sentiment_score,0)) * COALESCE(j.st_mentions,0)
      ) / (params.w_reddit * COALESCE(j.reddit_mentions,0) +
            params.w_stocktwits * COALESCE(j.st_mentions,0))
      ELSE NULL
    END AS blended_abs
  FROM joined j, params
) j
LEFT JOIN prices p
  ON p.symbol = j.symbol AND p.trade_date = j.trade_date
ORDER BY j.trade_date, j.symbol;
