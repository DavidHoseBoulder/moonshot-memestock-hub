-- Fix security issues by enabling RLS on staging tables

-- Enable RLS on staging tables that are missing it
ALTER TABLE staging_reddit_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging_reddit_submissions ENABLE ROW LEVEL SECURITY;  
ALTER TABLE staging_reddit_submissions_buf ENABLE ROW LEVEL SECURITY;

-- Create policies for staging tables (service role access for data processing)
CREATE POLICY "Service role can manage staging_reddit_comments"
ON staging_reddit_comments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can manage staging_reddit_submissions"
ON staging_reddit_submissions  
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can manage staging_reddit_submissions_buf"
ON staging_reddit_submissions_buf
FOR ALL  
TO service_role
USING (true)
WITH CHECK (true);

-- Fix function search paths
CREATE OR REPLACE FUNCTION public.is_market_data_fresh(symbol_param text, hours_threshold integer DEFAULT 24)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.enhanced_market_data 
    WHERE symbol = symbol_param 
    AND created_at > NOW() - INTERVAL '1 hour' * hours_threshold
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_reddit_sentiment_to_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- For each symbol mentioned in the sentiment analysis, create/update sentiment_history record
  IF NEW.symbols_mentioned IS NOT NULL AND array_length(NEW.symbols_mentioned, 1) > 0 THEN
    -- Insert/update sentiment_history for each symbol
    INSERT INTO sentiment_history (
      symbol,
      source,
      sentiment_score,
      confidence_score,
      data_timestamp,
      source_id,
      content_snippet,
      metadata,
      created_at,
      updated_at
    )
    SELECT
      symbol_name,
      'reddit',
      NEW.overall_sentiment,
      NEW.confidence_score,
      NEW.post_created_at,
      NEW.post_id,
      LEFT(NEW.title, 200),
      jsonb_build_object(
        'subreddit', NEW.subreddit,
        'score', NEW.score,
        'num_comments', NEW.num_comments,
        'themes', NEW.key_themes,
        'signals', NEW.investment_signals,
        'post_id', NEW.post_id
      ),
      NEW.created_at,
      NEW.created_at
    FROM unnest(NEW.symbols_mentioned) AS symbol_name
    ON CONFLICT (source, source_id) 
    DO UPDATE SET
      sentiment_score = EXCLUDED.sentiment_score,
      confidence_score = EXCLUDED.confidence_score,
      data_timestamp = EXCLUDED.data_timestamp,
      content_snippet = EXCLUDED.content_snippet,
      metadata = EXCLUDED.metadata,
      updated_at = EXCLUDED.updated_at;
  END IF;
  
  RETURN NEW;
END;
$function$;