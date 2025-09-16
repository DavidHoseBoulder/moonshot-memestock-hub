\set ON_ERROR_STOP on

-- v_trade_mentions_primary links seeded trades to the dominant subreddit/author
-- metadata derived from reddit_mentions. Realized return uses entry/exit prices.
CREATE OR REPLACE VIEW public.v_trade_mentions_primary AS
WITH trades_base AS (
  SELECT
    t.trade_id,
    t.symbol,
    t.side,
    t.horizon,
    'n/a'::text AS model_version,
    t.trade_date,
    CASE
      WHEN t.exit_price IS NULL THEN NULL
      WHEN t.side = 'LONG'
        THEN (t.exit_price - t.entry_price)/NULLIF(t.entry_price,0)
      ELSE (t.entry_price - t.exit_price)/NULLIF(t.entry_price,0)
    END AS realized_pct
  FROM public.trades t
  WHERE t.source = 'rules-backfill-v2'
    AND t.mode   = 'paper'
    AND t.exit_price IS NOT NULL
),
mention_subreddit AS (
  SELECT
    m.symbol,
    (m.created_utc AT TIME ZONE 'UTC')::date AS trade_date,
    COALESCE(NULLIF(m.subreddit,''), 'UNKNOWN') AS subreddit,
    COUNT(*) AS mention_cnt
  FROM public.reddit_mentions m
  GROUP BY 1,2,3
),
subreddit_rank AS (
  SELECT
    ms.symbol,
    ms.trade_date,
    ms.subreddit,
    ms.mention_cnt,
    SUM(ms.mention_cnt) OVER (PARTITION BY ms.symbol, ms.trade_date) AS total_mentions,
    ROW_NUMBER() OVER (PARTITION BY ms.symbol, ms.trade_date ORDER BY ms.mention_cnt DESC, ms.subreddit) AS rn
  FROM mention_subreddit ms
),
primary_subreddit AS (
  SELECT
    symbol,
    trade_date,
    subreddit,
    mention_cnt,
    total_mentions
  FROM subreddit_rank
  WHERE rn = 1
),
mention_author AS (
  SELECT
    m.symbol,
    (m.created_utc AT TIME ZONE 'UTC')::date AS trade_date,
    COALESCE(NULLIF(m.author,''), 'UNKNOWN') AS author,
    MAX(m.author_karma) AS author_karma,
    COUNT(*) AS mention_cnt
  FROM public.reddit_mentions m
  GROUP BY 1,2,3
),
author_rank AS (
  SELECT
    ma.symbol,
    ma.trade_date,
    ma.author,
    ma.author_karma,
    ma.mention_cnt,
    SUM(ma.mention_cnt) OVER (PARTITION BY ma.symbol, ma.trade_date) AS total_mentions,
    ROW_NUMBER() OVER (PARTITION BY ma.symbol, ma.trade_date ORDER BY ma.mention_cnt DESC, ma.author) AS rn
  FROM mention_author ma
),
primary_author AS (
  SELECT
    symbol,
    trade_date,
    author,
    author_karma,
    mention_cnt,
    total_mentions
  FROM author_rank
  WHERE rn = 1
)
SELECT
  tb.trade_id,
  tb.symbol,
  tb.side,
  tb.horizon,
  tb.model_version,
  tb.trade_date,
  tb.realized_pct,
  ps.subreddit AS primary_subreddit,
  ps.mention_cnt AS primary_sub_mentions,
  ps.total_mentions AS total_sub_mentions,
  CASE WHEN ps.total_mentions > 0 THEN ps.mention_cnt::numeric / ps.total_mentions ELSE NULL END AS primary_sub_share,
  COALESCE(pa.author, 'UNKNOWN') AS primary_author,
  pa.author_karma AS primary_author_karma,
  pa.mention_cnt AS primary_author_mentions,
  pa.total_mentions AS total_author_mentions,
  CASE WHEN pa.total_mentions > 0 THEN pa.mention_cnt::numeric / pa.total_mentions ELSE NULL END AS primary_author_share
FROM trades_base tb
LEFT JOIN primary_subreddit ps
  ON ps.symbol = tb.symbol AND ps.trade_date = tb.trade_date
LEFT JOIN primary_author pa
  ON pa.symbol = tb.symbol AND pa.trade_date = tb.trade_date;

-- Aggregate performance by dominant subreddit.
CREATE OR REPLACE VIEW public.v_trade_perf_by_subreddit AS
SELECT
  COALESCE(primary_subreddit, 'UNKNOWN') AS primary_subreddit,
  model_version,
  horizon,
  side,
  COUNT(*) AS n_trades,
  AVG(realized_pct) AS avg_ret,
  AVG(CASE WHEN realized_pct > 0 THEN 1 ELSE 0 END)::numeric AS win_rate,
  AVG(primary_sub_share) AS avg_primary_sub_share
FROM public.v_trade_mentions_primary
GROUP BY 1,2,3,4;

-- Aggregate performance by author karma tier (dominant author per trade).
CREATE OR REPLACE VIEW public.v_trade_perf_by_author_tier AS
WITH base AS (
  SELECT
    v.*,
    CASE
      WHEN primary_author IS NULL OR primary_author = 'UNKNOWN' THEN 'UNKNOWN'
      WHEN primary_author_karma IS NULL THEN 'UNKNOWN'
      WHEN primary_author_karma >= 100000 THEN '100k+'
      WHEN primary_author_karma >= 10000 THEN '10k-100k'
      WHEN primary_author_karma >= 1000 THEN '1k-10k'
      WHEN primary_author_karma >= 100 THEN '100-1k'
      ELSE '<100'
    END AS author_tier
  FROM public.v_trade_mentions_primary v
)
SELECT
  author_tier,
  model_version,
  horizon,
  side,
  COUNT(*) AS n_trades,
  AVG(realized_pct) AS avg_ret,
  AVG(CASE WHEN realized_pct > 0 THEN 1 ELSE 0 END)::numeric AS win_rate,
  AVG(primary_author_share) AS avg_primary_author_share
FROM base
GROUP BY 1,2,3,4;
