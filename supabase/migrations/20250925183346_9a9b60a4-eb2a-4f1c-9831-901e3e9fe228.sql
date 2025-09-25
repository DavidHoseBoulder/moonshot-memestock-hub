-- Fix RLS policies for all tables that views depend on

-- Fix enhanced_market_data policies (needed by v_home_kpis)
ALTER TABLE enhanced_market_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enhanced_market_data_authenticated_select" ON enhanced_market_data;
CREATE POLICY "enhanced_market_data_authenticated_select" 
  ON enhanced_market_data 
  FOR SELECT 
  TO authenticated, anon
  USING (true);

-- Fix reddit_mentions (needed by v_reddit_daily_signals)  
ALTER TABLE reddit_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reddit_mentions_authenticated_select" ON reddit_mentions;
CREATE POLICY "reddit_mentions_authenticated_select" 
  ON reddit_mentions 
  FOR SELECT 
  TO authenticated, anon
  USING (true);

-- Fix reddit_sentiment_daily if it exists (backup check)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reddit_sentiment_daily') THEN
    ALTER TABLE reddit_sentiment_daily ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "reddit_sentiment_daily_authenticated_select" ON reddit_sentiment_daily;
    CREATE POLICY "reddit_sentiment_daily_authenticated_select" 
      ON reddit_sentiment_daily 
      FOR SELECT 
      TO authenticated, anon
      USING (true);
  END IF;
END $$;