-- Grant SELECT access to v_reddit_daily_signals view
DROP POLICY IF EXISTS "Allow authenticated users to read reddit daily signals" ON reddit_sentiment;
CREATE POLICY "Allow authenticated users to read reddit daily signals"
ON reddit_sentiment
FOR SELECT
TO authenticated
USING (true);

-- Grant SELECT access to live_sentiment_entry_rules
DROP POLICY IF EXISTS "Allow authenticated users to read entry rules" ON live_sentiment_entry_rules;
CREATE POLICY "Allow authenticated users to read entry rules"
ON live_sentiment_entry_rules
FOR SELECT
TO authenticated
USING (true);

-- Grant SELECT access to sentiment_history (if not already granted)
DROP POLICY IF EXISTS "Allow authenticated users to read sentiment history" ON sentiment_history;
CREATE POLICY "Allow authenticated users to read sentiment history"
ON sentiment_history
FOR SELECT
TO authenticated
USING (true);
