-- Adds subreddit/author metadata to reddit_mentions for enrichment diagnostics.
-- Safe to run repeatedly.
ALTER TABLE public.reddit_mentions
  ADD COLUMN IF NOT EXISTS doc_type text,
  ADD COLUMN IF NOT EXISTS doc_id text,
  ADD COLUMN IF NOT EXISTS subreddit text,
  ADD COLUMN IF NOT EXISTS author text,
  ADD COLUMN IF NOT EXISTS author_karma numeric;

-- Convenience index for symbol/date lookups used by diagnostics.
CREATE INDEX IF NOT EXISTS idx_reddit_mentions_symbol_date
  ON public.reddit_mentions (symbol, created_utc);
