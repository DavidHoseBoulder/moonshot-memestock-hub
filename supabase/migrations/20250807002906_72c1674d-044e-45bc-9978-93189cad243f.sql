-- Create enhanced market data table with caching
CREATE TABLE IF NOT EXISTS public.enhanced_market_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  price DECIMAL,
  volume BIGINT,
  timestamp TIMESTAMPTZ NOT NULL,
  technical_indicators JSONB,
  price_change_1d DECIMAL,
  price_change_5d DECIMAL,
  data_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create sentiment analysis table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.sentiment_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id TEXT,
  symbol TEXT NOT NULL,
  sentiment_score DECIMAL NOT NULL,
  confidence DECIMAL NOT NULL,
  post_content TEXT,
  source TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_enhanced_market_data_symbol_date ON public.enhanced_market_data(symbol, data_date);
CREATE INDEX IF NOT EXISTS idx_sentiment_analysis_symbol_timestamp ON public.sentiment_analysis(symbol, timestamp);

-- Enable RLS
ALTER TABLE public.enhanced_market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentiment_analysis ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since this is market data)
CREATE POLICY "Public read access for enhanced_market_data" 
ON public.enhanced_market_data FOR SELECT 
USING (true);

CREATE POLICY "Public insert access for enhanced_market_data" 
ON public.enhanced_market_data FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Public update access for enhanced_market_data" 
ON public.enhanced_market_data FOR UPDATE 
USING (true);

CREATE POLICY "Public read access for sentiment_analysis" 
ON public.sentiment_analysis FOR SELECT 
USING (true);

CREATE POLICY "Public insert access for sentiment_analysis" 
ON public.sentiment_analysis FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Public update access for sentiment_analysis" 
ON public.sentiment_analysis FOR UPDATE 
USING (true);

-- Create a data freshness check function
CREATE OR REPLACE FUNCTION public.is_market_data_fresh(symbol_param TEXT, hours_threshold INTEGER DEFAULT 24)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.enhanced_market_data 
    WHERE symbol = symbol_param 
    AND created_at > NOW() - INTERVAL '1 hour' * hours_threshold
  );
END;
$$ LANGUAGE plpgsql;