-- Fix RLS policies for sentiment_analysis table
-- Drop existing policies and recreate with proper permissions
DROP POLICY IF EXISTS "Allow public insert to sentiment analysis" ON public.sentiment_analysis;
DROP POLICY IF EXISTS "Allow public read access to sentiment analysis" ON public.sentiment_analysis;

-- Create proper RLS policies for sentiment_analysis
CREATE POLICY "Enable insert for service role" ON public.sentiment_analysis
FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable read for service role" ON public.sentiment_analysis
FOR SELECT USING (true);

-- Ensure RLS is enabled
ALTER TABLE public.sentiment_analysis ENABLE ROW LEVEL SECURITY;