-- Adds author metadata to reddit_finance_keep_norm.
ALTER TABLE public.reddit_finance_keep_norm
  ADD COLUMN IF NOT EXISTS author text;
