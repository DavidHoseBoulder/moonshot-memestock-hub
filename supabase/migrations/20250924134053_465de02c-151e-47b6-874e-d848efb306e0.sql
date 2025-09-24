-- Fix final remaining database function security issues

-- Update the remaining functions to have proper search_path security

CREATE OR REPLACE FUNCTION public.upsert_daily_marks(p_mark_date date)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
with src as (
  -- trades that should be represented on p_mark_date
  select
    t.trade_id, t.symbol, t.mode, t.side,
    t.entry_price::numeric   as entry_price,
    t.exit_price::numeric    as exit_price,
    t.qty::numeric           as qty,
    coalesce(t.fees_total,0)::numeric as fees,
    case
      when t.status = 'CLOSED' and date(t.exit_ts) = p_mark_date
        then 'CLOSED'
      when t.status = 'OPEN' and date(t.entry_ts) <= p_mark_date
        then 'OPEN'
      else null
    end as status_on_mark
  from trades t
  where
    (t.status = 'OPEN'  and date(t.entry_ts) <= p_mark_date)
    or
    (t.status = 'CLOSED' and date(t.exit_ts) = p_mark_date)
),
priced as (
  select
    s.*,
    -- same-day EOD price (if available)
    emd.price::numeric as eod_price
  from src s
  left join enhanced_market_data emd
    on emd.symbol = s.symbol
   and emd.data_date = p_mark_date
),
calc as (
  select
    p.trade_id, p.symbol, p.mode, p.status_on_mark,
    p.entry_price, p.exit_price, p.qty, p.fees,
    -- mark_price: exit on close day, else EOD if present, else entry
    case
      when p.status_on_mark = 'CLOSED' then p.exit_price
      else coalesce(p.eod_price, p.entry_price)
    end as mark_price,
    -- realized on close day
    case
      when p.status_on_mark = 'CLOSED' then
        (case
           when p.side = 'LONG'  then (p.exit_price - p.entry_price) * p.qty
           else                      (p.entry_price - p.exit_price) * p.qty
         end) - p.fees
      else null
    end as realized_pnl,
    -- unrealized for open day
    case
      when p.status_on_mark = 'OPEN' then
        (case
           when p.side = 'LONG'  then (coalesce(p.eod_price, p.entry_price) - p.entry_price) * p.qty
           else                      (p.entry_price - coalesce(p.eod_price, p.entry_price)) * p.qty
         end)
      else null
    end as unrealized_pnl
  from priced p
  where p.status_on_mark is not null
)
insert into daily_trade_marks (
  mark_date, trade_id, symbol, mode, status_on_mark,
  entry_price, exit_price, mark_price, realized_pnl, unrealized_pnl, qty, fees_total
)
select
  p_mark_date, trade_id, symbol, mode, status_on_mark,
  entry_price, exit_price, mark_price, realized_pnl, unrealized_pnl, qty, fees
from calc
on conflict (mark_date, trade_id) do update
set symbol          = excluded.symbol,
    mode            = excluded.mode,
    status_on_mark  = excluded.status_on_mark,
    entry_price     = excluded.entry_price,
    exit_price      = excluded.exit_price,
    mark_price      = excluded.mark_price,
    realized_pnl    = excluded.realized_pnl,
    unrealized_pnl  = excluded.unrealized_pnl,
    qty             = excluded.qty,
    fees_total      = excluded.fees_total;
$function$;

CREATE OR REPLACE FUNCTION public.get_global_rule_defaults(p_model_version text)
 RETURNS TABLE(def_min_posts integer, def_min_score numeric, def_min_conf numeric)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
  WITH r AS (
    SELECT min_mentions, pos_thresh, min_conf
    FROM live_sentiment_entry_rules
    WHERE is_enabled = true
      AND model_version = p_model_version
  )
  SELECT
    percentile_disc(0.5) WITHIN GROUP (ORDER BY min_mentions)::int AS def_min_posts,
    percentile_disc(0.5) WITHIN GROUP (ORDER BY pos_thresh)        AS def_min_score,
    percentile_disc(0.5) WITHIN GROUP (ORDER BY min_conf)          AS def_min_conf
  FROM r;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_mentions_batch(p_model text, p_limit integer DEFAULT 200)
 RETURNS TABLE(mention_id bigint, post_id text, symbol text, subreddit text, title text, selftext text, created_utc timestamp with time zone, permalink text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
WITH unscored AS (
  SELECT
    m.mention_id,
    m.doc_type,
    m.doc_id,
    m.post_id,
    m.symbol,
    m.created_utc
  FROM public.reddit_mentions m
  LEFT JOIN public.reddit_sentiment s
    ON s.mention_id = m.mention_id
   AND s.model_version = p_model
  WHERE s.mention_id IS NULL
  ORDER BY m.created_utc
  LIMIT p_limit
)
SELECT
  u.mention_id,
  u.post_id,                                  -- thread id (for posts = post id; for comments = parent post id)
  u.symbol,
  d.subreddit,
  d.title,
  d.body_text       AS selftext,
  COALESCE(d.created_utc, u.created_utc) AS created_utc,
  NULL::text        AS permalink            -- not needed by scorer; leave NULL
FROM unscored u
JOIN public.reddit_mentions_all d
  ON d.doc_type = u.doc_type
 AND d.doc_id   = u.doc_id
ORDER BY u.created_utc;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recommended_trades_conf(p_date date DEFAULT NULL::date)
 RETURNS TABLE(symbol text, side text, horizon text, grade text, confidence_score integer, confidence_label text, has_open_any boolean, has_open_paper boolean, has_open_real boolean, sharpe numeric, trades integer, avg_ret numeric, win_rate numeric, rule_threshold numeric, min_mentions integer, score numeric, mentions integer, triggered_at timestamp with time zone, start_date date, end_date date, grade_explain text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
WITH h AS (  -- active heuristics row for this model
  SELECT *
  FROM Reddit_Heuristics
  WHERE is_active = true
    AND model_version = 'gpt-sent-v1'
  ORDER BY effective_at DESC
  LIMIT 1
),
d AS (  -- the day we're rendering
  SELECT COALESCE(
           p_date,
           (SELECT max(trade_date) FROM v_entry_candidates WHERE model_version = 'gpt-sent-v1')
         ) AS d
),
c AS (  -- candidates for that day
  SELECT *
  FROM v_entry_candidates
  WHERE model_version = 'gpt-sent-v1'
    AND trade_date = (SELECT d FROM d)
),
-- optional: pull the most recent backtest stats to populate trades/sharpe/etc.
bt_best AS (
  SELECT DISTINCT ON (b.symbol, b.horizon, b.side, b.min_mentions, b.pos_thresh, b.model_version)
         b.symbol, b.horizon, b.side, b.min_mentions, b.pos_thresh::numeric AS pos_thresh,
         b.model_version, b.trades, b.avg_ret, b.win_rate, b.sharpe, b.start_date, b.end_date, b.created_at
  FROM backtest_sweep_results b
  WHERE b.model_version = 'gpt-sent-v1'
  ORDER BY b.symbol, b.horizon, b.side, b.min_mentions, b.pos_thresh, b.model_version, b.created_at DESC
),
open_flags AS (
  SELECT UPPER(tr.symbol) AS symbol, tr.horizon, tr.mode
  FROM trades tr
  WHERE tr.status = 'OPEN'
),
joined AS (
  SELECT
    c.symbol,
    c.side,
    c.horizon,
    NULL::text AS grade,                  -- keep schema compat; we're not grading here
    b.sharpe,
    b.trades,
    b.avg_ret,
    b.win_rate,
    c.pos_thresh::numeric   AS rule_threshold,
    c.min_mentions,
    c.used_score::numeric   AS score,
    c.n_mentions            AS mentions,
    c.confidence::numeric   AS conf,      -- 0..1 from v_entry_candidates
    (SELECT d FROM d)::timestamptz        AS triggered_at,
    (SELECT d FROM d)        AS start_date,
    b.end_date               AS end_date,
    NULL::text              AS grade_explain,
    EXISTS (SELECT 1 FROM open_flags o WHERE o.symbol = c.symbol AND o.horizon = c.horizon)                      AS has_open_any,
    EXISTS (SELECT 1 FROM open_flags o WHERE o.symbol = c.symbol AND o.horizon = c.horizon AND o.mode = 'paper') AS has_open_paper,
    EXISTS (SELECT 1 FROM open_flags o WHERE o.symbol = c.symbol AND o.horizon = c.horizon AND o.mode = 'real')  AS has_open_real
  FROM c
  LEFT JOIN bt_best b
    ON b.symbol = c.symbol
   AND b.horizon = c.horizon
   AND b.side = c.side
   AND b.min_mentions = c.min_mentions
   AND b.pos_thresh = c.pos_thresh::numeric
   AND b.model_version = c.model_version
),
final AS (
  SELECT
    j.symbol,
    j.side,
    j.horizon,
    j.grade,
    ROUND(100 * j.conf)::integer AS confidence_score,
    CASE
      WHEN j.conf >= 0.70 THEN 'High'
      WHEN j.conf >= 0.50 THEN 'Medium'
      ELSE 'Low'
    END AS confidence_label,
    j.has_open_any,
    j.has_open_paper,
    j.has_open_real,
    j.sharpe,
    j.trades,
    j.avg_ret,
    j.win_rate,
    j.rule_threshold,
    j.min_mentions,
    j.score,
    j.mentions,
    j.triggered_at,
    j.start_date,
    j.end_date,
    j.grade_explain
  FROM joined j
)
SELECT *
FROM final
ORDER BY confidence_score DESC,
         CASE grade WHEN 'Strong' THEN 0 WHEN 'Moderate' THEN 1 ELSE 2 END,
         sharpe DESC NULLS LAST,
         CASE horizon WHEN '1d' THEN 0 WHEN '3d' THEN 1 WHEN '5d' THEN 2 ELSE 3 END,
         symbol;
$function$;