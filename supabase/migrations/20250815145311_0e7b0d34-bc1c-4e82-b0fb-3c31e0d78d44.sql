-- Add start_line column to support chunked processing continuation
ALTER TABLE public.import_queue
ADD COLUMN IF NOT EXISTS start_line integer NOT NULL DEFAULT 0;

-- Helpful index to pick oldest pending jobs quickly (optional but safe)
CREATE INDEX IF NOT EXISTS idx_import_queue_status_created_at
  ON public.import_queue (status, created_at);
