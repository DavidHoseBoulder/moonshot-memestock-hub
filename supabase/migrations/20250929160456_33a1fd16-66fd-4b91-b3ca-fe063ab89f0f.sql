-- Fix RLS policies for sentiment data access

-- Update live_sentiment_entry_rules to allow authenticated users to read
DROP POLICY IF EXISTS "live_sentiment_entry_rules_authenticated_only_select" ON public.live_sentiment_entry_rules;
DROP POLICY IF EXISTS "live_sentiment_entry_rules_authenticated_select" ON public.live_sentiment_entry_rules;
CREATE POLICY "live_sentiment_entry_rules_authenticated_select" 
ON public.live_sentiment_entry_rules 
FOR SELECT 
TO authenticated 
USING (true);

-- Update reddit_sentiment to allow authenticated users to read  
DROP POLICY IF EXISTS "reddit_sentiment_authenticated_only_select" ON public.reddit_sentiment;
DROP POLICY IF EXISTS "reddit_sentiment_authenticated_select" ON public.reddit_sentiment;
CREATE POLICY "reddit_sentiment_authenticated_select" 
ON public.reddit_sentiment 
FOR SELECT 
TO authenticated 
USING (true);

-- Ensure v_reddit_daily_signals view has proper access by updating the underlying reddit_sentiment table policy
-- The view inherits permissions from the underlying tables
