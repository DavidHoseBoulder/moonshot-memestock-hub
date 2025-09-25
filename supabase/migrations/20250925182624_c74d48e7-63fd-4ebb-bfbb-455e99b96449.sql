-- Fix RLS policies to require authentication instead of allowing anonymous access

-- Fix trades table RLS policies
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trades_authenticated_select" ON trades;
DROP POLICY IF EXISTS "trades_service_role_all" ON trades;

CREATE POLICY "trades_authenticated_select" 
  ON trades 
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "trades_service_role_all" 
  ON trades 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Update previously fixed tables to require authentication instead of anonymous access
DROP POLICY IF EXISTS "live_sentiment_entry_rules_authenticated_select" ON live_sentiment_entry_rules;
CREATE POLICY "live_sentiment_entry_rules_authenticated_select" 
  ON live_sentiment_entry_rules 
  FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "reddit_sentiment_authenticated_select" ON reddit_sentiment;
CREATE POLICY "reddit_sentiment_authenticated_select" 
  ON reddit_sentiment 
  FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "reddit_heuristics_authenticated_select" ON reddit_heuristics;
CREATE POLICY "reddit_heuristics_authenticated_select" 
  ON reddit_heuristics 
  FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "reddit_mentions_authenticated_select" ON reddit_mentions;
CREATE POLICY "reddit_mentions_authenticated_select" 
  ON reddit_mentions 
  FOR SELECT 
  TO authenticated 
  USING (true);