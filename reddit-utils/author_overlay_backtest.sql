-- Author Overlay Backtest
-- Purpose: Measure lift when combining base entries (live_sentiment_entry_rules)
--          with recent author cohorts (author and author+symbol), across horizons.
-- Params
--   START_DATE, END_DATE: backtest window (inclusive)
--   HORIZONS: comma list, e.g., '1,3,5'
--   ENTRY_SESSION: 'next_open' or 'same_close'
--   POS_THRESH: sentiment threshold already implicit in base; used for sided author cohorts if needed
--   COHORT_LOOKBACK_DAYS: e.g., 60
--   MIN_AUTHOR_TRADES: min trades in lookback for author cohort
--   MIN_AUTHOR_SYMBOL_TRADES: min trades for author+symbol cohort
--   ALIGN_WINRATE_MIN: optional min win rate to consider cohort supportive (default 0.5)

\set ON_ERROR_STOP on

\pset format csv
\pset tuples_only on

\if :{?SIDE_FILTER}
\else
  \set SIDE_FILTER ''
\endif

\if :{?ALIGN_SCORE_MIN}
\else
  \set ALIGN_SCORE_MIN 0
\endif

-- Inputs
-- live_sentiment_entry_rules is a rule table; expand to daily candidates via trading calendar.

with
params as (
  select
    to_date(:'START_DATE','YYYY-MM-DD') as start_date,
    to_date(:'END_DATE','YYYY-MM-DD') as end_date,
    :HORIZONS::text as horizons_csv,
    coalesce(:'ENTRY_SESSION','next_open') as entry_session,
    coalesce(:COHORT_LOOKBACK_DAYS,60)::int as lookback_days,
    coalesce(:MIN_AUTHOR_TRADES,10)::int as min_author_trades,
    coalesce(:MIN_AUTHOR_SYMBOL_TRADES,10)::int as min_author_symbol_trades,
    coalesce(NULLIF(:'SIDE_FILTER',''), 'ALL')::text as side_filter,
    coalesce(:ALIGN_SCORE_MIN,0)::numeric as align_score_min
),
cal as (
  -- Build trading calendar from prices_daily view if available; fallback to distinct market_date
  select d::date as trade_date
  from generate_series((select start_date from params), (select end_date from params), interval '1 day') g(d)
  where extract(isodow from d) between 1 and 5
    and not exists (select 1 from market_holidays_us h where h.holiday = g.d::date)
),
enabled_rules as (
  select upper(r.symbol) as symbol,
         r.side,
         coalesce(r.start_date, (select start_date from params)) as rule_start,
         coalesce(r.end_date,   (select end_date   from params)) as rule_end
  from live_sentiment_entry_rules r
  where r.is_enabled = true
),
base as (
  select distinct c.trade_date, r.symbol, r.side
  from cal c
  join enabled_rules r
    on c.trade_date between r.rule_start and r.rule_end
  join params p on true
  where p.side_filter = 'ALL' or r.side = p.side_filter
),
mentions as (
  -- Source of per-mention signals via reddit_sentiment join
  select
    (m.created_utc AT TIME ZONE 'UTC')::date AS mention_date,
    upper(m.symbol) AS symbol,
    m.author::text AS author,
    s.score::numeric AS score
  from reddit_mentions m
  join reddit_sentiment s on s.mention_id = m.mention_id
  join params p on true
  where (m.created_utc AT TIME ZONE 'UTC')::date between (p.start_date - p.lookback_days) and p.end_date
    and m.symbol is not null and m.symbol <> ''
    and m.author is not null and m.author <> ''
),
sided as (
  -- Map score to LONG/SHORT using zero threshold; adjust if needed
  select mention_date, symbol, author,
         case when score > 0 then 'LONG' when score < 0 then 'SHORT' else null end as side
  from mentions
),
cohort_author as (
  -- rolling lookback aggregates per author
  select b.trade_date, b.symbol, m.author,
         sum(case when m.side = 'LONG' then 1 else 0 end) as longs,
         sum(case when m.side = 'SHORT' then 1 else 0 end) as shorts,
         count(*) as n_trades
  from base b
  left join sided m
    on m.symbol = b.symbol
   and m.author is not null
   and m.mention_date >= b.trade_date - (select lookback_days from params)
   and m.mention_date <  b.trade_date
  group by 1,2,3
),
cohort_author_symbol as (
  select b.trade_date, b.symbol, m.author,
         sum(case when m.side = 'LONG' then 1 else 0 end) as longs,
         sum(case when m.side = 'SHORT' then 1 else 0 end) as shorts,
         count(*) as n_trades
  from base b
  left join sided m
    on m.symbol = b.symbol
   and m.author is not null
   and m.mention_date >= b.trade_date - (select lookback_days from params)
   and m.mention_date <  b.trade_date
  group by 1,2,3
),
cohort_author_strength as (
  select trade_date, symbol,
         sum(n_trades) as n_trades,
         sum(longs) as longs,
         sum(shorts) as shorts
  from cohort_author
  group by 1,2
),
cohort_author_symbol_strength as (
  select trade_date, symbol,
         sum(n_trades) as n_trades,
         sum(longs) as longs,
         sum(shorts) as shorts
  from cohort_author_symbol
  group by 1,2
),
overlay as (
  -- Build overlay labels to test
  select b.trade_date, b.symbol, b.side,
         cas.n_trades as n_trades_sym,
         cas.longs as longs_sym,
         cas.shorts as shorts_sym,
         ca.n_trades as n_trades_auth,
         ca.longs as longs_auth,
         ca.shorts as shorts_auth,
         -- alignment
         case when b.side = 'LONG' then coalesce(cas.longs,0) - coalesce(cas.shorts,0) else coalesce(cas.shorts,0) - coalesce(cas.longs,0) end as align_score_sym,
         case when b.side = 'LONG' then coalesce(ca.longs,0) - coalesce(ca.shorts,0) else coalesce(ca.shorts,0) - coalesce(ca.longs,0) end as align_score_auth
  from base b
  left join cohort_author_symbol_strength cas using (trade_date, symbol)
  left join cohort_author_strength ca using (trade_date, symbol)
),
variants as (
  select *,
         -- Filters
         (n_trades_sym >= (select min_author_symbol_trades from params) and align_score_sym > (select align_score_min from params)) as keep_align_sym,
         (n_trades_auth >= (select min_author_trades from params) and align_score_auth > (select align_score_min from params)) as keep_align_auth,
         -- Contrarian block
         (n_trades_sym >= (select min_author_symbol_trades from params) and align_score_sym < 0) as block_contra_sym,
         (n_trades_auth >= (select min_author_trades from params) and align_score_auth < 0) as block_contra_auth,
         -- Weights (simple): 1 + sigmoid(align_score/5)
         1.0 + 1.0/(1.0 + exp(-coalesce(align_score_sym,0)/5.0)) as w_sym,
         1.0 + 1.0/(1.0 + exp(-coalesce(align_score_auth,0)/5.0)) as w_auth
  from overlay
)

-- Direct tee into CSV is safer from the shell; print results to stdout.
SELECT * FROM (
  SELECT 'base'::text AS variant, v.trade_date, v.symbol, v.side, 1.0::numeric AS weight FROM variants v
  UNION ALL
  SELECT 'align_sym', v.trade_date, v.symbol, v.side, 1.0 FROM variants v WHERE keep_align_sym
  UNION ALL
  SELECT 'align_auth', v.trade_date, v.symbol, v.side, 1.0 FROM variants v WHERE keep_align_auth
  UNION ALL
  SELECT 'block_contra_sym', v.trade_date, v.symbol, v.side, 1.0 FROM variants v WHERE NOT block_contra_sym
  UNION ALL
  SELECT 'block_contra_auth', v.trade_date, v.symbol, v.side, 1.0 FROM variants v WHERE NOT block_contra_auth
  UNION ALL
  SELECT 'weighted_sym', v.trade_date, v.symbol, v.side, w_sym FROM variants v
  UNION ALL
  SELECT 'weighted_auth', v.trade_date, v.symbol, v.side, w_auth FROM variants v
) candidates
ORDER BY trade_date, symbol;
