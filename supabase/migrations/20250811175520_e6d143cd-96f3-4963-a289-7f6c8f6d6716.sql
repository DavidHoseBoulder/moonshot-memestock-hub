-- Add a resume-friendly unique key for sentiment_history to enable idempotent re-runs
BEGIN;

-- 1) Add source_id to track the original content identifier (e.g., Reddit post id)
ALTER TABLE public.sentiment_history
ADD COLUMN IF NOT EXISTS source_id text;

-- 2) Create a partial unique index on (source, source_id) so duplicates are skipped when re-running
--    The WHERE clause allows existing rows without source_id and keeps flexibility for other sources
CREATE UNIQUE INDEX IF NOT EXISTS sentiment_history_source_source_id_unique
ON public.sentiment_history (source, source_id)
WHERE source_id IS NOT NULL;

COMMIT;