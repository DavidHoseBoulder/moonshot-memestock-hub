-- Create raw social ingest table for Reddit backfill (submissions + comments)
CREATE TABLE IF NOT EXISTS public.social_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'reddit',
  mode text, -- 'comments' | 'submissions'
  reddit_id text NOT NULL,
  subreddit text NOT NULL,
  author text,
  title text,
  selftext text,
  body text,
  url text,
  permalink text,
  link_id text,
  parent_id text,
  symbols_detected text[] DEFAULT '{}',
  source_run_id text,
  posted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent uniqueness on raw reddit id per source
CREATE UNIQUE INDEX IF NOT EXISTS social_raw_unique_source_reddit_id
ON public.social_raw (source, reddit_id);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS social_raw_subreddit_idx ON public.social_raw (subreddit);
CREATE INDEX IF NOT EXISTS social_raw_posted_at_desc ON public.social_raw (posted_at DESC);

-- RLS and basic policies (align with other public-readable tables)
ALTER TABLE public.social_raw ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'social_raw' AND policyname = 'Public read access for social_raw'
  ) THEN
    CREATE POLICY "Public read access for social_raw"
      ON public.social_raw
      FOR SELECT
      USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'social_raw' AND policyname = 'Public insert access for social_raw'
  ) THEN
    CREATE POLICY "Public insert access for social_raw"
      ON public.social_raw
      FOR INSERT
      WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'social_raw' AND policyname = 'Public update access for social_raw'
  ) THEN
    CREATE POLICY "Public update access for social_raw"
      ON public.social_raw
      FOR UPDATE
      USING (true);
  END IF;
END $$;

-- Auto-update updated_at on changes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_social_raw_updated_at'
  ) THEN
    CREATE TRIGGER update_social_raw_updated_at
      BEFORE UPDATE ON public.social_raw
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;