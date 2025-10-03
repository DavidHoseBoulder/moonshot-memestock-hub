-- Enable RLS on trades table
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert trades
CREATE POLICY "Authenticated users can insert trades"
ON public.trades
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to view all trades (needed for dashboard/monitoring)
CREATE POLICY "Authenticated users can view trades"
ON public.trades
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to update trades (for closing positions)
CREATE POLICY "Authenticated users can update trades"
ON public.trades
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to delete trades (for cancellations)
CREATE POLICY "Authenticated users can delete trades"
ON public.trades
FOR DELETE
TO authenticated
USING (true);