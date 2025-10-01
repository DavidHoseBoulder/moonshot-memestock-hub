-- Restrict sensitive strategy data exposure: authenticated-only reads on backtesting_results

-- Ensure RLS is enabled
ALTER TABLE public.backtesting_results ENABLE ROW LEVEL SECURITY;

-- Drop overly permissive public read policy if it exists
DROP POLICY IF EXISTS "Allow public read access to backtesting results" ON public.backtesting_results;

-- Create strict read policy: only authenticated users can read
CREATE POLICY "Authenticated users can read backtesting results"
ON public.backtesting_results
FOR SELECT
USING (auth.role() = 'authenticated');

-- Keep existing INSERT policy as-is to avoid breaking writer flows (edge functions use service role and bypass RLS)
-- No changes to INSERT/UPDATE/DELETE policies in this migration.
