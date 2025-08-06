-- Create tables for historical trading data and sentiment analysis

-- Stock/crypto price data table
CREATE TABLE public.market_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('stock', 'crypto')),
  price DECIMAL(20,8) NOT NULL,
  volume BIGINT,
  market_cap BIGINT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Reddit sentiment analysis results
CREATE TABLE public.sentiment_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id TEXT NOT NULL,
  subreddit TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  author TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  num_comments INTEGER NOT NULL DEFAULT 0,
  post_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- AI sentiment analysis results
  symbols_mentioned TEXT[] DEFAULT '{}',
  overall_sentiment DECIMAL(3,2) CHECK (overall_sentiment >= -1 AND overall_sentiment <= 1),
  sentiment_label TEXT CHECK (sentiment_label IN ('very_bearish', 'bearish', 'neutral', 'bullish', 'very_bullish')),
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  key_themes TEXT[],
  investment_signals TEXT[],
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, subreddit)
);

-- Backtesting results table
CREATE TABLE public.backtesting_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  strategy_name TEXT NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Performance metrics
  total_return DECIMAL(10,4),
  annualized_return DECIMAL(10,4),
  volatility DECIMAL(10,4),
  sharpe_ratio DECIMAL(10,4),
  max_drawdown DECIMAL(10,4),
  win_rate DECIMAL(5,2),
  
  -- Sentiment correlation metrics
  sentiment_correlation DECIMAL(5,4),
  sentiment_accuracy DECIMAL(5,2),
  
  -- Strategy parameters
  sentiment_threshold DECIMAL(3,2),
  holding_period_days INTEGER,
  position_size DECIMAL(5,4),
  
  trades_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_market_data_symbol_timestamp ON public.market_data(symbol, timestamp);
CREATE INDEX idx_market_data_timestamp ON public.market_data(timestamp);
CREATE INDEX idx_sentiment_analysis_symbols ON public.sentiment_analysis USING GIN(symbols_mentioned);
CREATE INDEX idx_sentiment_analysis_subreddit_created ON public.sentiment_analysis(subreddit, post_created_at);
CREATE INDEX idx_sentiment_analysis_sentiment ON public.sentiment_analysis(overall_sentiment, sentiment_label);
CREATE INDEX idx_backtesting_symbol_strategy ON public.backtesting_results(symbol, strategy_name);

-- Enable Row Level Security (tables will be publicly readable for now since this is a demo app)
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentiment_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtesting_results ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (demo app)
CREATE POLICY "Allow public read access to market data" 
ON public.market_data FOR SELECT 
USING (true);

CREATE POLICY "Allow public read access to sentiment analysis" 
ON public.sentiment_analysis FOR SELECT 
USING (true);

CREATE POLICY "Allow public read access to backtesting results" 
ON public.backtesting_results FOR SELECT 
USING (true);

-- Allow public insert for demo purposes (in production, you'd want proper auth)
CREATE POLICY "Allow public insert to market data" 
ON public.market_data FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public insert to sentiment analysis" 
ON public.sentiment_analysis FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public insert to backtesting results" 
ON public.backtesting_results FOR INSERT 
WITH CHECK (true);