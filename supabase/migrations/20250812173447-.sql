-- Ensure ON CONFLICT works for sentiment_analysis by creating a unique index
-- 1) Deduplicate existing rows on (post_id, subreddit) keeping the earliest
WITH dup AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY post_id, subreddit ORDER BY created_at ASC, id ASC) AS rn
  FROM public.sentiment_analysis
  WHERE post_id IS NOT NULL AND subreddit IS NOT NULL
)
DELETE FROM public.sentiment_analysis sa
USING dup d
WHERE sa.id = d.id AND d.rn > 1;

-- 2) Create full unique index for ON CONFLICT (post_id, subreddit)
CREATE UNIQUE INDEX IF NOT EXISTS ux_sentiment_analysis_post_id_subreddit
ON public.sentiment_analysis (post_id, subreddit);
