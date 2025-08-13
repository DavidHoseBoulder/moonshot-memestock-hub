-- Add missing column used by edge function inserts
ALTER TABLE public.backtesting_results
ADD COLUMN IF NOT EXISTS signal_quality double precision;

-- Optional: help ordering by recency in UI queries
CREATE INDEX IF NOT EXISTS idx_backtesting_results_created_at
ON public.backtesting_results (created_at DESC);