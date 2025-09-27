-- stocktwits_reddit_leadlag.sql
-- Run with: psql "$PGURI" -f analysis/stocktwits_reddit_leadlag.sql
-- Produces lead/lag stats for StockTwits vs Reddit per ticker-day.

WITH st_first AS (
  SELECT
    sh.collected_at::date AS day,
    sh.symbol,
    MIN((msg->>'created_at')::timestamptz) AS st_first_ts
  FROM sentiment_history sh
  CROSS JOIN LATERAL jsonb_array_elements(sh.metadata->'messages') msg
  WHERE sh.source = 'stocktwits'
    AND sh.collected_at BETWEEN '2025-09-18'::date AND '2025-09-26'::date
  GROUP BY 1,2
),
rd_first AS (
  SELECT
    date_trunc('day', created_utc)::date AS day,
    symbol,
    MIN(created_utc) AS rd_first_ts
  FROM reddit_mentions
  WHERE created_utc BETWEEN '2025-09-18'::timestamptz AND '2025-09-27'::timestamptz
  GROUP BY 1,2
),
joined AS (
  SELECT
    st.day,
    st.symbol,
    st.st_first_ts,
    rd.rd_first_ts,
    EXTRACT(EPOCH FROM (st.st_first_ts - rd.rd_first_ts))/60.0 AS lead_minutes
  FROM st_first st
  JOIN rd_first rd USING(day, symbol)
)
SELECT
  COUNT(*) AS ticker_days,
  SUM(CASE WHEN lead_minutes < 0 THEN 1 ELSE 0 END) AS st_leads,
  SUM(CASE WHEN lead_minutes > 0 THEN 1 ELSE 0 END) AS rd_leads,
  SUM(CASE WHEN lead_minutes = 0 THEN 1 ELSE 0 END) AS simultaneous,
  ROUND(PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY lead_minutes)::numeric, 2) AS median_lead_min,
  ROUND(PERCENTILE_DISC(0.25) WITHIN GROUP (ORDER BY lead_minutes)::numeric, 2) AS p25_lead_min,
  ROUND(PERCENTILE_DISC(0.75) WITHIN GROUP (ORDER BY lead_minutes)::numeric, 2) AS p75_lead_min
FROM joined;
