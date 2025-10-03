-- Add sentiment_blend JSON column to store Reddit/StockTwits blend weights
ALTER TABLE reddit_heuristics
ADD COLUMN IF NOT EXISTS sentiment_blend jsonb DEFAULT '{}'::jsonb;

-- Seed the currently active heuristic with the validated 30/70 blend
UPDATE reddit_heuristics
SET sentiment_blend = '{"reddit":0.3,"stocktwits":0.7}'
WHERE is_active = true;
