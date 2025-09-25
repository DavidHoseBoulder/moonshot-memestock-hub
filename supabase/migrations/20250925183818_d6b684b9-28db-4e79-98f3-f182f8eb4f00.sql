-- Fix RLS policies to allow both authenticated and anon users for read access
-- This ensures that all requests work regardless of which role is used

-- Update trades table
DROP POLICY IF EXISTS "trades_authenticated_select" ON trades;
CREATE POLICY "trades_authenticated_select" 
  ON trades 
  FOR SELECT 
  TO authenticated, anon
  USING (true);

-- Update reddit_sentiment table
DROP POLICY IF EXISTS "reddit_sentiment_authenticated_select" ON reddit_sentiment;
CREATE POLICY "reddit_sentiment_authenticated_select" 
  ON reddit_sentiment 
  FOR SELECT 
  TO authenticated, anon
  USING (true);

-- Update reddit_heuristics table
DROP POLICY IF EXISTS "reddit_heuristics_authenticated_select" ON reddit_heuristics;
CREATE POLICY "reddit_heuristics_authenticated_select" 
  ON reddit_heuristics 
  FOR SELECT 
  TO authenticated, anon
  USING (true);