-- Create comprehensive sentiment history table for all data sources
CREATE TABLE public.sentiment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  source TEXT NOT NULL, -- 'reddit', 'stocktwits', 'news', 'youtube', 'google_trends'
  sentiment_score NUMERIC, -- Normalized 0-1 sentiment score
  raw_sentiment NUMERIC, -- Original sentiment value from source
  confidence_score NUMERIC DEFAULT 0, -- Quality/confidence of the sentiment
  data_timestamp TIMESTAMP WITH TIME ZONE NOT NULL, -- When the original data was created
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), -- When we collected it
  
  -- Source-specific data
  metadata JSONB, -- Store source-specific fields (post_id, message_id, article_url, etc.)
  content_snippet TEXT, -- Sample of the content for debugging
  
  -- Aggregation helpers
  volume_indicator INTEGER DEFAULT 1, -- Number of posts/messages/articles represented
  engagement_score NUMERIC, -- Likes, comments, shares, etc.
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint to prevent duplicates (symbol + source + data_timestamp + metadata key)
-- This allows multiple entries per symbol/source/timestamp if they represent different content
CREATE UNIQUE INDEX idx_sentiment_history_unique 
ON public.sentiment_history (symbol, source, data_timestamp, COALESCE((metadata->>'content_id')::text, id::text));

-- Create indexes for efficient querying
CREATE INDEX idx_sentiment_history_symbol_source ON public.sentiment_history (symbol, source);
CREATE INDEX idx_sentiment_history_timestamp ON public.sentiment_history (data_timestamp DESC);
CREATE INDEX idx_sentiment_history_symbol_recent ON public.sentiment_history (symbol, data_timestamp DESC);
CREATE INDEX idx_sentiment_history_source_recent ON public.sentiment_history (source, data_timestamp DESC);

-- Enable Row Level Security
ALTER TABLE public.sentiment_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public access (no authentication required for this trading app)
CREATE POLICY "Allow public read access to sentiment history" 
ON public.sentiment_history 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert to sentiment history" 
ON public.sentiment_history 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update to sentiment history" 
ON public.sentiment_history 
FOR UPDATE 
USING (true);

-- Create trigger for updating updated_at timestamp
CREATE TRIGGER update_sentiment_history_updated_at
  BEFORE UPDATE ON public.sentiment_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_trading_signals_updated_at();