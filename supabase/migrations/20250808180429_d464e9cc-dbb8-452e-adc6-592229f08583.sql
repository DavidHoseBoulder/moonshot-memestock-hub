-- Create the missing update function first
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create enhanced sentiment data table
CREATE TABLE IF NOT EXISTS public.enhanced_sentiment_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  current_sentiment NUMERIC NOT NULL,
  sentiment_velocity JSONB,
  confidence NUMERIC NOT NULL,
  key_themes TEXT[],
  social_signals TEXT[],
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, timestamp)
);

-- Enable RLS
ALTER TABLE public.enhanced_sentiment_data ENABLE ROW LEVEL SECURITY;

-- Create policies for enhanced sentiment data
CREATE POLICY "Enhanced sentiment data is publicly readable" 
ON public.enhanced_sentiment_data 
FOR SELECT 
USING (true);

CREATE POLICY "Enhanced sentiment data can be inserted by service" 
ON public.enhanced_sentiment_data 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Enhanced sentiment data can be updated by service" 
ON public.enhanced_sentiment_data 
FOR UPDATE 
USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_enhanced_sentiment_symbol ON public.enhanced_sentiment_data(symbol);
CREATE INDEX IF NOT EXISTS idx_enhanced_sentiment_timestamp ON public.enhanced_sentiment_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_enhanced_sentiment_symbol_timestamp ON public.enhanced_sentiment_data(symbol, timestamp DESC);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_enhanced_sentiment_data_updated_at
BEFORE UPDATE ON public.enhanced_sentiment_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();