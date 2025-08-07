-- Fix RLS policies for sentiment_analysis table - this time properly
-- Drop all existing policies first
DROP POLICY IF EXISTS "Enable insert for service role" ON public.sentiment_analysis;
DROP POLICY IF EXISTS "Enable read for service role" ON public.sentiment_analysis;
DROP POLICY IF EXISTS "Allow public insert to sentiment analysis" ON public.sentiment_analysis;
DROP POLICY IF EXISTS "Allow public read access to sentiment analysis" ON public.sentiment_analysis;

-- Create permissive policies that allow all operations
CREATE POLICY "Allow all operations" ON public.sentiment_analysis
FOR ALL USING (true) WITH CHECK (true);

-- Ensure RLS is enabled
ALTER TABLE public.sentiment_analysis ENABLE ROW LEVEL SECURITY;