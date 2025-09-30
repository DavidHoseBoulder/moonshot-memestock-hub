-- Add RLS policies for authenticated users to read reddit_sentiment and live_sentiment_entry_rules

-- Allow authenticated users to read reddit_sentiment
CREATE POLICY "reddit_sentiment_authenticated_read"
ON public.reddit_sentiment
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to read live_sentiment_entry_rules
CREATE POLICY "live_sentiment_entry_rules_authenticated_read"
ON public.live_sentiment_entry_rules
FOR SELECT
TO authenticated
USING (true);