-- Remove anon access policies that were just added
-- Keep only authenticated user access for all sentiment tables

-- Remove anon policies I just added
DROP POLICY IF EXISTS "live_sentiment_entry_rules_anon_select" ON public.live_sentiment_entry_rules;
DROP POLICY IF EXISTS "sentiment_grade_config_anon_select" ON public.sentiment_grade_config;
DROP POLICY IF EXISTS "enhanced_sentiment_data_anon_select" ON public.enhanced_sentiment_data;
DROP POLICY IF EXISTS "sentiment_analysis_anon_select" ON public.sentiment_analysis;

-- Ensure all sentiment tables have authenticated-only access
-- Update existing policies to be explicit about authenticated role only

-- Update reddit_sentiment policy to be more explicit
DROP POLICY IF EXISTS "reddit_sentiment_authenticated_select" ON public.reddit_sentiment;
CREATE POLICY "reddit_sentiment_authenticated_only_select" 
ON public.reddit_sentiment 
FOR SELECT 
TO authenticated 
USING (true);

-- Ensure live_sentiment_entry_rules is authenticated only
DROP POLICY IF EXISTS "live_sentiment_entry_rules_authenticated_select" ON public.live_sentiment_entry_rules;
CREATE POLICY "live_sentiment_entry_rules_authenticated_only_select" 
ON public.live_sentiment_entry_rules 
FOR SELECT 
TO authenticated 
USING (true);

-- Ensure sentiment_grade_config is authenticated only
DROP POLICY IF EXISTS "sentiment_grade_config_authenticated_select" ON public.sentiment_grade_config;
CREATE POLICY "sentiment_grade_config_authenticated_only_select" 
ON public.sentiment_grade_config 
FOR SELECT 
TO authenticated 
USING (true);

-- Ensure enhanced_sentiment_data is authenticated only
DROP POLICY IF EXISTS "Enhanced sentiment data is publicly readable" ON public.enhanced_sentiment_data;
CREATE POLICY "enhanced_sentiment_data_authenticated_only_select" 
ON public.enhanced_sentiment_data 
FOR SELECT 
TO authenticated 
USING (true);

-- Ensure sentiment_analysis is authenticated only
DROP POLICY IF EXISTS "Authenticated users can manage sentiment analysis" ON public.sentiment_analysis;
CREATE POLICY "sentiment_analysis_authenticated_only_select" 
ON public.sentiment_analysis 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "sentiment_analysis_authenticated_only_insert" 
ON public.sentiment_analysis 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "sentiment_analysis_authenticated_only_update" 
ON public.sentiment_analysis 
FOR UPDATE 
TO authenticated 
USING (true);

-- Ensure sentiment_history is authenticated only
DROP POLICY IF EXISTS "Authenticated users can read sentiment history" ON public.sentiment_history;
DROP POLICY IF EXISTS "Authenticated users can insert sentiment history" ON public.sentiment_history;  
DROP POLICY IF EXISTS "Authenticated users can update sentiment history" ON public.sentiment_history;

CREATE POLICY "sentiment_history_authenticated_only_select" 
ON public.sentiment_history 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "sentiment_history_authenticated_only_insert" 
ON public.sentiment_history 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "sentiment_history_authenticated_only_update" 
ON public.sentiment_history 
FOR UPDATE 
TO authenticated 
USING (true);