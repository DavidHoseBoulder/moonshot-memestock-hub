-- Deduplicate existing sentiment_history rows before adding unique index
DO $$ 
BEGIN
  -- Primary attempt: keep the newest by created_at/id when present
  BEGIN
    WITH ranked AS (
      SELECT
        ctid,
        row_number() OVER (
          PARTITION BY symbol, source, data_timestamp
          ORDER BY created_at DESC NULLS LAST, id DESC NULLS LAST
        ) AS rn
      FROM public.sentiment_history
    )
    DELETE FROM public.sentiment_history s
    USING ranked r
    WHERE s.ctid = r.ctid AND r.rn > 1;
  EXCEPTION WHEN undefined_column THEN
    -- Fallback: if created_at or id columns don't exist, keep an arbitrary first row
    WITH ranked AS (
      SELECT
        ctid,
        row_number() OVER (
          PARTITION BY symbol, source, data_timestamp
          ORDER BY ctid
        ) AS rn
      FROM public.sentiment_history
    )
    DELETE FROM public.sentiment_history s
    USING ranked r
    WHERE s.ctid = r.ctid AND r.rn > 1;
  END;
END $$;

-- Re-attempt creating the unique index for deduplication by hour-timestamp
CREATE UNIQUE INDEX IF NOT EXISTS sentiment_history_symbol_source_ts_unique
ON public.sentiment_history (symbol, source, data_timestamp);
