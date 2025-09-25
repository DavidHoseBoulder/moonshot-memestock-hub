-- Fix RLS policies for the tables causing permission denied errors

-- Check if RLS is enabled and fix policies for live_sentiment_entry_rules
ALTER TABLE live_sentiment_entry_rules ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to ensure they work correctly
DROP POLICY IF EXISTS "live_sentiment_entry_rules_authenticated_select" ON live_sentiment_entry_rules;
DROP POLICY IF EXISTS "live_sentiment_entry_rules_service_role_all" ON live_sentiment_entry_rules;

CREATE POLICY "live_sentiment_entry_rules_authenticated_select" 
  ON live_sentiment_entry_rules 
  FOR SELECT 
  TO authenticated, anon 
  USING (true);

CREATE POLICY "live_sentiment_entry_rules_service_role_all" 
  ON live_sentiment_entry_rules 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Fix policies for reddit_sentiment
ALTER TABLE reddit_sentiment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reddit_sentiment_authenticated_select" ON reddit_sentiment;
DROP POLICY IF EXISTS "reddit_sentiment_service_role_all" ON reddit_sentiment;

CREATE POLICY "reddit_sentiment_authenticated_select" 
  ON reddit_sentiment 
  FOR SELECT 
  TO authenticated, anon 
  USING (true);

CREATE POLICY "reddit_sentiment_service_role_all" 
  ON reddit_sentiment 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Also fix reddit_heuristics to be safe
ALTER TABLE reddit_heuristics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reddit_heuristics_authenticated_select" ON reddit_heuristics;
DROP POLICY IF EXISTS "reddit_heuristics_service_role_all" ON reddit_heuristics;

CREATE POLICY "reddit_heuristics_authenticated_select" 
  ON reddit_heuristics 
  FOR SELECT 
  TO authenticated, anon 
  USING (true);

CREATE POLICY "reddit_heuristics_service_role_all" 
  ON reddit_heuristics 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);