-- Fix RLS policies for reddit_mentions table to allow authenticated users to read
-- The view v_reddit_daily_signals depends on this table but users can't access it

-- First check current policies
DO $$
BEGIN
  -- Drop existing restrictive policies if they exist
  DROP POLICY IF EXISTS "reddit_mentions_authenticated_select" ON reddit_mentions;
  DROP POLICY IF EXISTS "reddit_mentions_service_role_all" ON reddit_mentions;
  
  -- Create new permissive policies for authenticated users
  CREATE POLICY "reddit_mentions_authenticated_select" 
    ON reddit_mentions 
    FOR SELECT 
    TO authenticated 
    USING (true);

  CREATE POLICY "reddit_mentions_service_role_all" 
    ON reddit_mentions 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

  -- Enable RLS if not already enabled
  ALTER TABLE reddit_mentions ENABLE ROW LEVEL SECURITY;
END $$;