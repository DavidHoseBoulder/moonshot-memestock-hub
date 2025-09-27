-- stocktwits_reddit_calibration.sql
-- Usage: psql "$PGURI" -f analysis/stocktwits_reddit_calibration.sql > analysis/stocktwits_reddit_calibration.csv
-- Exports up to the three most recent StockTwits messages per ticker-day alongside
-- Reddit sentiment aggregates for the same window; adjust the hard-coded dates as needed.

COPY (
with stocktwits_messages as (
  select
    sh.collected_at::date as day,
    sh.symbol,
    (msg->>'id')::bigint as st_message_id,
    (msg->>'created_at')::timestamptz as st_created_at,
    coalesce(msg->'entities'->'sentiment'->>'basic', msg->'sentiment'->>'basic') as st_label,
    (msg->'user'->>'followers')::int as st_followers,
    msg->>'body' as st_body,
    row_number() over (
      partition by sh.collected_at::date, sh.symbol
      order by (msg->>'created_at')::timestamptz desc
    ) as rn
  from sentiment_history sh
  cross join lateral jsonb_array_elements(sh.metadata->'messages') msg
  where sh.source = 'stocktwits'
    and sh.collected_at >= '2025-09-18'::date
    and sh.collected_at <  '2025-09-27'::date
),
reddit_sentiment_agg as (
  select
    date_trunc('day', m.created_utc)::date as day,
    m.symbol,
    count(*) as reddit_mentions,
    sum(case when s.label = 'POSITIVE' then 1 else 0 end) as reddit_positive,
    sum(case when s.label = 'NEGATIVE' then 1 else 0 end) as reddit_negative,
    round(avg(s.score)::numeric, 3) as reddit_avg_score
  from reddit_mentions m
  join reddit_sentiment s on s.mention_id = m.mention_id
  where m.created_utc >= '2025-09-18'::timestamptz
    and m.created_utc <  '2025-09-27'::timestamptz
  group by 1, 2
)
select
  sm.day,
  sm.symbol,
  sm.st_message_id,
  sm.st_created_at,
  sm.st_label,
  sm.st_followers,
  ra.reddit_mentions,
  ra.reddit_positive,
  ra.reddit_negative,
  ra.reddit_avg_score,
  sm.st_body
from stocktwits_messages sm
join reddit_sentiment_agg ra
  on ra.day = sm.day and ra.symbol = sm.symbol
where sm.rn <= 3
order by sm.day desc, sm.symbol, sm.st_created_at desc
) TO STDOUT WITH CSV HEADER;
