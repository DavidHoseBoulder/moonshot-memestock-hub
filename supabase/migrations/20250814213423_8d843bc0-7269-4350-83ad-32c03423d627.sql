-- Create trigger to automatically populate sentiment_history from sentiment_analysis
-- This eliminates data duplication while maintaining all existing functionality

CREATE OR REPLACE FUNCTION sync_reddit_sentiment_to_history()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Create trigger that fires after insert or update on sentiment_analysis
DROP TRIGGER IF EXISTS sync_reddit_sentiment_trigger ON sentiment_analysis;
CREATE TRIGGER sync_reddit_sentiment_trigger
  AFTER INSERT OR UPDATE ON sentiment_analysis
  FOR EACH ROW
  EXECUTE FUNCTION sync_reddit_sentiment_to_history();