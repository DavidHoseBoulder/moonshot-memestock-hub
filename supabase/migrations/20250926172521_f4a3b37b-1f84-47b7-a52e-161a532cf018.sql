-- Temporarily disable RLS on trades table to recreate policies fresh
ALTER TABLE public.trades DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies on trades table
DROP POLICY IF EXISTS "trades_authenticated_select" ON public.trades;
DROP POLICY IF EXISTS "trades_service_role_all" ON public.trades;

-- Re-enable RLS
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- Create fresh policies
CREATE POLICY "trades_public_read" 
  ON public.trades 
  FOR SELECT 
  USING (true);

CREATE POLICY "trades_service_role_all" 
  ON public.trades 
  FOR ALL 
  TO service_role
  USING (true)
  WITH CHECK (true);