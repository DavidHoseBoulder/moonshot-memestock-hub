-- Create table to track reddit backfill runs
CREATE TABLE IF NOT EXISTS public.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL UNIQUE,
  file text,
  batch_size integer,
  status text NOT NULL DEFAULT 'running',
  scanned_total integer DEFAULT 0,
  queued_total integer DEFAULT 0,
  analyzed_total integer DEFAULT 0,
  inserted_total integer DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;

-- Policies: publicly readable; inserts/updates allowed (edge function uses service role)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'import_runs' AND policyname = 'Import runs are publicly readable'
  ) THEN
    CREATE POLICY "Import runs are publicly readable"
      ON public.import_runs FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'import_runs' AND policyname = 'Import runs can be inserted'
  ) THEN
    CREATE POLICY "Import runs can be inserted"
      ON public.import_runs FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'import_runs' AND policyname = 'Import runs can be updated'
  ) THEN
    CREATE POLICY "Import runs can be updated"
      ON public.import_runs FOR UPDATE
      USING (true);
  END IF;
END $$;

-- Trigger to keep updated_at fresh
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_import_runs_updated_at'
  ) THEN
    CREATE TRIGGER update_import_runs_updated_at
    BEFORE UPDATE ON public.import_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Helpful index for lookups
CREATE INDEX IF NOT EXISTS idx_import_runs_run_id ON public.import_runs(run_id);
