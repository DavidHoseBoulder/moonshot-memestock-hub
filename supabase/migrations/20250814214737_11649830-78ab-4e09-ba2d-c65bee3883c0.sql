-- Temporarily disable the Reddit sentiment sync trigger for bulk loading
-- This improves performance during large data imports
DROP TRIGGER IF EXISTS sync_reddit_sentiment_trigger ON sentiment_analysis;