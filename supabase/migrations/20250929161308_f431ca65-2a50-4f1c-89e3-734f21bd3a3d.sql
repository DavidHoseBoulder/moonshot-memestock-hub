-- Fix view permissions for sentiment data access
-- Views need explicit permissions, not just RLS on underlying tables

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant select permissions on the problematic views to authenticated users
GRANT SELECT ON public.v_reddit_daily_signals TO authenticated;
GRANT SELECT ON public.v_sentiment_history TO authenticated;
GRANT SELECT ON public.v_sentiment_velocity_lite TO authenticated;
GRANT SELECT ON public.v_entry_candidates TO authenticated;

-- Also grant on any other sentiment-related views
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;