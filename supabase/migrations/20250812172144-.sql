-- Fix upsert error for sentiment_history by adding matching unique index
-- and ensure import_runs.upsert works by adding unique index on run_id.
-- Also deduplicate existing rows that would violate the new constraint.

-- 1) Deduplicate sentiment_history on (source, source_id) where both are not null
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY source, source_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.sentiment_history
  WHERE source IS NOT NULL AND source_id IS NOT NULL
)
DELETE FROM public.sentiment_history sh
USING duplicates d
WHERE sh.id = d.id AND d.rn > 1;

-- 2) Create unique index to support ON CONFLICT (source, source_id)
CREATE UNIQUE INDEX IF NOT EXISTS ux_sentiment_history_source_source_id
ON public.sentiment_history (source, source_id)
WHERE source IS NOT NULL AND source_id IS NOT NULL;

-- 3) Ensure import_runs.upsert on run_id works reliably
-- Deduplicate by keeping earliest started_at
WITH dup_runs AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY run_id ORDER BY started_at ASC, id ASC) AS rn
  FROM public.import_runs
)
DELETE FROM public.import_runs ir
USING dup_runs d
WHERE ir.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_import_runs_run_id
ON public.import_runs (run_id);
