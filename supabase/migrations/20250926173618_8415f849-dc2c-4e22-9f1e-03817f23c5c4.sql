-- Drop all policies and recreate with explicit public access
DROP POLICY IF EXISTS "trades_public_read" ON public.trades;
DROP POLICY IF EXISTS "trades_service_role_all" ON public.trades;

-- Create a simple public read policy
CREATE POLICY "Enable read access for everyone" 
  ON public.trades 
  FOR SELECT 
  USING (true);

-- Keep service role policy for admin operations
CREATE POLICY "Service role can do everything" 
  ON public.trades 
  FOR ALL 
  TO service_role
  USING (true)
  WITH CHECK (true);