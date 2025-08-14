-- Create import queue table for background processing
CREATE TABLE IF NOT EXISTS public.import_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL UNIQUE,
  jsonl_url TEXT NOT NULL,
  subreddits TEXT[] DEFAULT '{}',
  symbols TEXT[] DEFAULT '{}',
  batch_size INTEGER DEFAULT 25,
  max_items INTEGER DEFAULT 0,
  concurrency INTEGER DEFAULT 3,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- Enable RLS
ALTER TABLE public.import_queue ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role access
CREATE POLICY "Service role can manage import queue" 
ON public.import_queue 
FOR ALL 
USING (true);

-- Index for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_import_queue_status ON public.import_queue(status, created_at);