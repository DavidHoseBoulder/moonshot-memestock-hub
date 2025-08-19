-- Create subreddit_universe table to centralize subreddit management
CREATE TABLE public.subreddit_universe (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  category text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subreddit_universe ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (similar to ticker_universe)
CREATE POLICY "Public read access for subreddit_universe"
ON public.subreddit_universe
FOR SELECT
USING (true);

CREATE POLICY "Public insert access for subreddit_universe"
ON public.subreddit_universe
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public update access for subreddit_universe"
ON public.subreddit_universe
FOR UPDATE
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_subreddit_universe_updated_at
BEFORE UPDATE ON public.subreddit_universe
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert all subreddits from the TypeScript registry
INSERT INTO public.subreddit_universe (name, category, priority, active, description) VALUES
-- Core Financial (Priority 1-10)
('stocks', 'Core Financial', 1, true, 'General stock discussion and analysis'),
('investing', 'Core Financial', 2, true, 'Long-term investment strategies'),
('SecurityAnalysis', 'Core Financial', 3, true, 'Deep fundamental analysis'),
('ValueInvesting', 'Core Financial', 4, true, 'Value investing strategies'),
('StockMarket', 'Core Financial', 5, true, 'Market news and discussion'),
('financialindependence', 'Core Financial', 6, true, 'FIRE movement and strategies'),
('portfolios', 'Core Financial', 7, true, 'Portfolio construction and review'),
('economy', 'Core Financial', 8, true, 'Economic analysis and news'),
('finance', 'Core Financial', 9, true, 'General finance discussion'),
('options', 'Core Financial', 10, true, 'Options trading strategies'),

-- Retail Trading (Priority 11-20)
('wallstreetbets', 'Retail Trading', 11, true, 'High-risk retail trading'),
('pennystocks', 'Retail Trading', 12, true, 'Penny stock discussion'),
('robinhood', 'Retail Trading', 13, true, 'Robinhood app users'),
('RobinHoodPennyStocks', 'Retail Trading', 14, true, 'Penny stocks on Robinhood'),
('smallstreetbets', 'Retail Trading', 15, true, 'Smaller position WSB-style trades'),
('daytrading', 'Retail Trading', 16, true, 'Day trading strategies'),
('swing_trading', 'Retail Trading', 17, true, 'Swing trading discussion'),
('trading', 'Retail Trading', 18, true, 'General trading discussion'),
('SecurityHolders', 'Retail Trading', 19, true, 'Security holders community'),
('StockMarketIndia', 'Retail Trading', 20, true, 'Indian stock market'),

-- Crypto & DeFi (Priority 21-30)
('CryptoCurrency', 'Crypto & DeFi', 21, true, 'General cryptocurrency discussion'),
('Bitcoin', 'Crypto & DeFi', 22, true, 'Bitcoin specific discussion'),
('ethereum', 'Crypto & DeFi', 23, true, 'Ethereum discussion'),
('DeFi', 'Crypto & DeFi', 24, true, 'Decentralized finance'),
('altcoin', 'Crypto & DeFi', 25, true, 'Alternative cryptocurrencies'),
('CryptoMoonShots', 'Crypto & DeFi', 26, true, 'High-risk crypto plays'),
('SatoshiStreetBets', 'Crypto & DeFi', 27, true, 'WSB-style crypto trading'),
('CryptoMarkets', 'Crypto & DeFi', 28, true, 'Crypto market analysis'),
('dogecoin', 'Crypto & DeFi', 29, true, 'Dogecoin community'),
('NFT', 'Crypto & DeFi', 30, true, 'NFT discussion'),

-- Tech & Innovation (Priority 31-40)
('technology', 'Tech & Innovation', 31, true, 'General technology news'),
('artificial', 'Tech & Innovation', 32, true, 'AI and machine learning'),
('MachineLearning', 'Tech & Innovation', 33, true, 'ML discussion and news'),
('singularity', 'Tech & Innovation', 34, true, 'AI singularity discussion'),
('Futurology', 'Tech & Innovation', 35, true, 'Future technology trends'),
('startups', 'Tech & Innovation', 36, true, 'Startup companies and culture'),
('entrepreneurship', 'Tech & Innovation', 37, true, 'Entrepreneurship discussion'),
('business', 'Tech & Innovation', 38, true, 'General business discussion'),
('programming', 'Tech & Innovation', 39, true, 'Programming and development'),
('teslamotors', 'Tech & Innovation', 40, true, 'Tesla specific discussion'),

-- Stock-Specific Communities (Priority 41-50)
('PLTR', 'Stock-Specific', 41, true, 'Palantir discussion'),
('TSLA', 'Stock-Specific', 42, true, 'Tesla stock discussion'),
('AMD_Stock', 'Stock-Specific', 43, true, 'AMD stock analysis'),
('NVDA_Stock', 'Stock-Specific', 44, true, 'NVIDIA stock discussion'),
('GME', 'Stock-Specific', 45, true, 'GameStop discussion'),
('Superstonk', 'Stock-Specific', 46, true, 'GameStop DD community'),
('amcstock', 'Stock-Specific', 47, true, 'AMC stock discussion'),
('AAPL', 'Stock-Specific', 48, true, 'Apple stock discussion'),
('MSFT_Stock', 'Stock-Specific', 49, true, 'Microsoft stock discussion'),
('SPACs', 'Stock-Specific', 50, true, 'SPAC investments'),

-- Economic & News (Priority 51-60)
('Economics', 'Economic & News', 51, true, 'Economic theory and analysis'),
('news', 'Economic & News', 52, true, 'General news'),
('worldnews', 'Economic & News', 53, true, 'International news'),
('economics', 'Economic & News', 54, true, 'Economic discussion'),
('geopolitics', 'Economic & News', 55, true, 'Geopolitical analysis'),
('energy', 'Economic & News', 56, true, 'Energy sector discussion'),
('oil', 'Economic & News', 57, true, 'Oil and petroleum'),
('gold', 'Economic & News', 58, true, 'Gold and precious metals'),
('inflation', 'Economic & News', 59, true, 'Inflation discussion'),
('recession', 'Economic & News', 60, true, 'Recession analysis'),

-- Alternative Investments (Priority 61-70)
('realestate', 'Alternative Investments', 61, true, 'Real estate investing'),
('REITs', 'Alternative Investments', 62, true, 'Real Estate Investment Trusts'),
('commodities', 'Alternative Investments', 63, true, 'Commodity trading'),
('forex', 'Alternative Investments', 64, true, 'Foreign exchange trading'),
('bonds', 'Alternative Investments', 65, true, 'Bond investing'),
('futures', 'Alternative Investments', 66, true, 'Futures trading'),
('collectibles', 'Alternative Investments', 67, true, 'Collectible investments'),
('wine', 'Alternative Investments', 68, false, 'Wine investing'),
('art', 'Alternative Investments', 69, false, 'Art investing'),
('watches', 'Alternative Investments', 70, false, 'Watch collecting'),

-- Learning & Education (Priority 71-80)
('personalfinance', 'Learning & Education', 71, true, 'Personal finance advice'),
('investing_discussion', 'Learning & Education', 72, true, 'Investment education'),
('financialplanning', 'Learning & Education', 73, true, 'Financial planning'),
('money', 'Learning & Education', 74, true, 'General money discussion'),
('frugal', 'Learning & Education', 75, false, 'Frugal living'),
('budgets', 'Learning & Education', 76, false, 'Budgeting advice'),
('creditcards', 'Learning & Education', 77, false, 'Credit card discussion'),
('leanfire', 'Learning & Education', 78, true, 'Lean FIRE community'),
('coastfire', 'Learning & Education', 79, true, 'Coast FIRE strategies'),
('Fire', 'Learning & Education', 80, true, 'Financial Independence Retire Early');

-- Create index for performance
CREATE INDEX idx_subreddit_universe_priority_active ON public.subreddit_universe (priority, active);
CREATE INDEX idx_subreddit_universe_category ON public.subreddit_universe (category);

-- Create a function to get active subreddits by priority (similar to ticker functions)
CREATE OR REPLACE FUNCTION public.get_active_subreddits_by_priority(max_priority integer DEFAULT 20)
RETURNS TABLE(name text, category text, priority integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.name, s.category, s.priority
  FROM public.subreddit_universe s
  WHERE s.active = true AND s.priority <= max_priority
  ORDER BY s.priority ASC;
$$;