-- Replace partial unique index with full unique index to satisfy ON CONFLICT (source, source_id)
-- 1) Drop the previous partial unique index if it exists
DROP INDEX IF EXISTS public.ux_sentiment_history_source_source_id;

-- 2) Deduplicate existing rows where both columns are non-null to avoid conflicts
WITH d AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY source, source_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.sentiment_history
  WHERE source IS NOT NULL AND source_id IS NOT NULL
)
DELETE FROM public.sentiment_history sh
USING d
WHERE sh.id = d.id AND d.rn > 1;

-- 3) Create a full unique index (no WHERE clause) so Postgres can use it as the arbiter for ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS ux_sentiment_history_source_source_id_all
ON public.sentiment_history (source, source_id);
