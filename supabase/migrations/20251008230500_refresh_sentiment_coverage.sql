-- Refresh 30-day sentiment coverage metrics and schedule nightly job

CREATE OR REPLACE FUNCTION public.refresh_sentiment_coverage()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  WITH coverage AS (
    SELECT
      t.symbol,
      COALESCE(SUM(CASE WHEN sh.source = 'reddit' THEN sh.total_messages ELSE 0 END), 0)::INTEGER AS reddit_msgs_30d,
      COALESCE(SUM(CASE WHEN sh.source = 'stocktwits' THEN sh.total_messages ELSE 0 END), 0)::INTEGER AS stocktwits_msgs_30d
    FROM ticker_universe t
    LEFT JOIN (
      SELECT
        UPPER(symbol) AS symbol,
        'reddit'::text AS source,
        COUNT(*)::numeric AS total_messages
      FROM public.reddit_mentions
      WHERE created_utc >= (NOW() - INTERVAL '30 days')
      GROUP BY 1
      UNION ALL
      SELECT
        UPPER(symbol) AS symbol,
        source,
        SUM(COALESCE(volume_indicator, 1)) AS total_messages
      FROM public.sentiment_history
      WHERE source IN ('stocktwits')
        AND data_timestamp >= (NOW() - INTERVAL '30 days')
      GROUP BY 1, 2
    ) sh
      ON sh.symbol = UPPER(t.symbol)
    GROUP BY t.symbol
  ), scored AS (
    SELECT
      symbol,
      reddit_msgs_30d,
      stocktwits_msgs_30d,
      ROUND((LEAST(reddit_msgs_30d / 30.0, 1.0) + LEAST(stocktwits_msgs_30d / 30.0, 1.0)) / 2.0, 4) AS sentiment_health_score
    FROM coverage
  )
  UPDATE ticker_universe t
  SET
    reddit_msgs_30d = scored.reddit_msgs_30d,
    stocktwits_msgs_30d = scored.stocktwits_msgs_30d,
    sentiment_health_score = scored.sentiment_health_score,
    updated_at = NOW()
  FROM scored
  WHERE scored.symbol = t.symbol
    AND (
      COALESCE(t.reddit_msgs_30d, -1) <> scored.reddit_msgs_30d OR
      COALESCE(t.stocktwits_msgs_30d, -1) <> scored.stocktwits_msgs_30d OR
      COALESCE(t.sentiment_health_score, -1) <> scored.sentiment_health_score
    );
END;
$$;

COMMENT ON FUNCTION public.refresh_sentiment_coverage() IS
  'Recomputes 30-day Reddit/Stocktwits message counts and updates ticker_universe coverage fields.';

CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule('sentiment-coverage-refresh');
EXCEPTION
  WHEN undefined_object THEN
    NULL;
  WHEN others THEN
    -- Ignore if job does not exist or cron catalog not initialized yet
    NULL;
END
$$;
SELECT cron.schedule(
  'sentiment-coverage-refresh',
  '15 * * * *', -- 15 minutes past the hour (after ingest jobs finish)
  $$SELECT public.refresh_sentiment_coverage();$$
);
