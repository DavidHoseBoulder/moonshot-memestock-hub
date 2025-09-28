-- Fix RLS policies for sentiment data access
-- The live_sentiment_entry_rules table is missing anon access policy

-- Add anon access to live_sentiment_entry_rules table
CREATE POLICY "live_sentiment_entry_rules_anon_select" 
ON public.live_sentiment_entry_rules 
FOR SELECT 
TO anon 
USING (true);

-- Add anon access to other sentiment tables that might be missing it
CREATE POLICY "sentiment_grade_config_anon_select" 
ON public.sentiment_grade_config 
FOR SELECT 
TO anon 
USING (true);

CREATE POLICY "enhanced_sentiment_data_anon_select" 
ON public.enhanced_sentiment_data 
FOR SELECT 
TO anon 
USING (true);

CREATE POLICY "sentiment_analysis_anon_select" 
ON public.sentiment_analysis 
FOR SELECT 
TO anon 
USING (true);