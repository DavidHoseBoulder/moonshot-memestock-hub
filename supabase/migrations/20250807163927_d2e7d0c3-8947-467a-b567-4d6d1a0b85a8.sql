-- Create trading signals table for performance tracking
CREATE TABLE public.trading_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  category TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('BUY', 'SELL', 'HOLD')),
  confidence DECIMAL(5,2) NOT NULL,
  price DECIMAL(10,4) NOT NULL,
  sentiment_score DECIMAL(5,4),
  sentiment_velocity DECIMAL(5,4),
  volume_ratio DECIMAL(6,2),
  rsi DECIMAL(5,2),
  technical_signals TEXT[],
  reasoning TEXT,
  
  -- Performance tracking fields
  entry_price DECIMAL(10,4),
  exit_price DECIMAL(10,4),
  actual_return DECIMAL(8,4),
  days_held INTEGER,
  outcome TEXT CHECK (outcome IN ('WIN', 'LOSS', 'PENDING', 'EXPIRED')),
  
  -- Metadata
  pipeline_run_id UUID,
  data_sources_used TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_trading_signals_ticker_date ON public.trading_signals (ticker, created_at DESC);
CREATE INDEX idx_trading_signals_outcome ON public.trading_signals (outcome, signal_type);
CREATE INDEX idx_trading_signals_confidence ON public.trading_signals (confidence DESC);

-- Enable RLS
ALTER TABLE public.trading_signals ENABLE ROW LEVEL SECURITY;

-- Create policy - public read for analysis, but could restrict if needed
CREATE POLICY "Trading signals are publicly readable" 
ON public.trading_signals 
FOR SELECT 
USING (true);

CREATE POLICY "Trading signals can be inserted" 
ON public.trading_signals 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Trading signals can be updated" 
ON public.trading_signals 
FOR UPDATE 
USING (true);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_trading_signals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trading_signals_updated_at
  BEFORE UPDATE ON public.trading_signals
  FOR EACH ROW
  EXECUTE FUNCTION update_trading_signals_updated_at();