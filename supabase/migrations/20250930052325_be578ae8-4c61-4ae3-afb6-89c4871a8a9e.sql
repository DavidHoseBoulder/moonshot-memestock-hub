-- Grant SELECT permissions on views to authenticated users
GRANT SELECT ON public.v_reddit_daily_signals TO authenticated;
GRANT SELECT ON public.v_stocktwits_daily_signals TO authenticated;
GRANT SELECT ON public.v_sentiment_daily_overlap TO authenticated;