-- Update Reddit sentiment views to surface confidence aggregates
-- 1) v_reddit_daily_signals now averages sentiment confidence per symbol/day
-- 2) v_entry_candidates propagates that confidence instead of returning NULL

BEGIN;

CREATE OR REPLACE VIEW public.v_reddit_daily_signals WITH (security_invoker='true') AS
WITH m AS (
  SELECT
    reddit_mentions.mention_id,
    ((reddit_mentions.created_utc AT TIME ZONE 'UTC'))::date AS trade_date,
    upper(reddit_mentions.symbol) AS symbol
  FROM public.reddit_mentions
),
j AS (
  SELECT
    m.trade_date,
    m.symbol,
    (s.score)::numeric      AS score,
    (s.confidence)::numeric AS confidence
  FROM m
  LEFT JOIN public.reddit_sentiment s USING (mention_id)
)
SELECT
  trade_date,
  symbol,
  COUNT(*)::integer                          AS n_mentions,
  COALESCE(AVG(score),       0::numeric)     AS avg_score,
  COALESCE(AVG(score),       0::numeric)     AS used_score,
  COALESCE(AVG(confidence),  0::numeric)     AS avg_confidence
FROM j
GROUP BY trade_date, symbol;


CREATE OR REPLACE VIEW public.v_entry_candidates WITH (security_invoker='true') AS
WITH rules AS (
  SELECT
    live_sentiment_entry_rules.symbol,
    live_sentiment_entry_rules.side,
    live_sentiment_entry_rules.horizon,
    live_sentiment_entry_rules.min_mentions,
    live_sentiment_entry_rules.pos_thresh,
    live_sentiment_entry_rules.use_weighted,
    live_sentiment_entry_rules.model_version
  FROM public.live_sentiment_entry_rules
  WHERE live_sentiment_entry_rules.is_enabled = true
),
joined AS (
  SELECT
    s.trade_date,
    r.symbol,
    r.side,
    r.horizon,
    s.n_mentions,
    r.min_mentions,
    r.pos_thresh,
    r.use_weighted,
    s.avg_score,
    s.used_score,
    CASE
      WHEN r.side = 'LONG'  THEN (s.used_score - r.pos_thresh)
      WHEN r.side = 'SHORT' THEN ((-s.used_score) - r.pos_thresh)
      ELSE NULL::numeric
    END AS margin,
    s.avg_confidence,
    r.model_version
  FROM public.v_reddit_daily_signals s
  JOIN rules r USING (symbol)
  WHERE s.n_mentions >= r.min_mentions
    AND (
      (r.side = 'LONG'  AND s.used_score >= r.pos_thresh) OR
      (r.side = 'SHORT' AND s.used_score <= (-r.pos_thresh))
    )
)
SELECT
  trade_date,
  symbol,
  side,
  horizon,
  n_mentions,
  pos_thresh,
  use_weighted,
  min_mentions,
  avg_score,
  used_score,
  used_score                           AS score,
  COALESCE(avg_confidence, 0::numeric) AS confidence,
  margin,
  model_version
FROM joined;

COMMIT;
