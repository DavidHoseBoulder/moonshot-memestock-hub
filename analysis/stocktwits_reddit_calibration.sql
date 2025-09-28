-- stocktwits_reddit_calibration.sql
-- Usage examples:
--   # default window (today-7d .. today+1) and top 3 StockTwits messages per ticker-day
--   psql "$PGURI" -f analysis/stocktwits_reddit_calibration.sql > analysis/stocktwits_reddit_calibration.csv
--
--   # explicit window + different message cap
--   psql "$PGURI" \
--     -v start_date='2025-09-11' \
--     -v end_date='2025-09-27'   \
--     -v max_messages=5           \
--     -f analysis/stocktwits_reddit_calibration.sql \
--     > /tmp/stocktwits_reddit_calibration.csv

\if :{?start_date}    \else \set start_date ''    \endif
\if :{?end_date}      \else \set end_date ''      \endif
\if :{?max_messages}  \else \set max_messages ''  \endif

COPY (
WITH params AS (
  SELECT
    COALESCE(NULLIF(:'start_date','')::date,
             (now() AT TIME ZONE 'utc')::date - 7) AS start_date,
    COALESCE(NULLIF(:'end_date','')::date,
             (now() AT TIME ZONE 'utc')::date + 1) AS end_date_exclusive,
    COALESCE(NULLIF(:'max_messages','')::int, 3)    AS max_messages
),
stocktwits_messages AS (
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
  from params, sentiment_history sh
  cross join lateral jsonb_array_elements(sh.metadata->'messages') msg
  where sh.source = 'stocktwits'
    and sh.collected_at >= params.start_date
    and sh.collected_at <  params.end_date_exclusive
),
reddit_sentiment_agg AS (
  select
    date_trunc('day', m.created_utc)::date as day,
    m.symbol,
    count(*) as reddit_mentions,
    sum(case when s.label = 'POSITIVE' then 1 else 0 end) as reddit_positive,
    sum(case when s.label = 'NEGATIVE' then 1 else 0 end) as reddit_negative,
    round(avg(s.score)::numeric, 3) as reddit_avg_score
  from params, reddit_mentions m
  join reddit_sentiment s on s.mention_id = m.mention_id
  where m.created_utc >= params.start_date
    and m.created_utc <  params.end_date_exclusive
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
join params on true
where sm.rn <= params.max_messages
order by sm.day desc, sm.symbol, sm.st_created_at desc
) TO STDOUT WITH CSV HEADER;
