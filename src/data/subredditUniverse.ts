export interface Subreddit {
  name: string;
  category: string;
  priority: number;
  active: boolean;
  description?: string;
}

export const SUBREDDIT_UNIVERSE: Subreddit[] = [
  // Core Financial (Priority 1-10) - Highest priority for sentiment tracking
  { name: 'stocks', category: 'Core Financial', priority: 1, active: true, description: 'General stock discussion and analysis' },
  { name: 'investing', category: 'Core Financial', priority: 2, active: true, description: 'Long-term investment strategies' },
  { name: 'SecurityAnalysis', category: 'Core Financial', priority: 3, active: true, description: 'Deep fundamental analysis' },
  { name: 'ValueInvesting', category: 'Core Financial', priority: 4, active: true, description: 'Value investing strategies' },
  { name: 'StockMarket', category: 'Core Financial', priority: 5, active: true, description: 'Market news and discussion' },
  { name: 'financialindependence', category: 'Core Financial', priority: 6, active: true, description: 'FIRE movement and strategies' },
  { name: 'portfolios', category: 'Core Financial', priority: 7, active: true, description: 'Portfolio construction and review' },
  { name: 'economy', category: 'Core Financial', priority: 8, active: true, description: 'Economic analysis and news' },
  { name: 'finance', category: 'Core Financial', priority: 9, active: true, description: 'General finance discussion' },
  { name: 'options', category: 'Core Financial', priority: 10, active: true, description: 'Options trading strategies' },

  // Retail Trading (Priority 11-20) - High volatility, sentiment-driven
  { name: 'wallstreetbets', category: 'Retail Trading', priority: 11, active: true, description: 'High-risk retail trading' },
  { name: 'pennystocks', category: 'Retail Trading', priority: 12, active: true, description: 'Penny stock discussion' },
  { name: 'robinhood', category: 'Retail Trading', priority: 13, active: true, description: 'Robinhood app users' },
  { name: 'RobinHoodPennyStocks', category: 'Retail Trading', priority: 14, active: true, description: 'Penny stocks on Robinhood' },
  { name: 'smallstreetbets', category: 'Retail Trading', priority: 15, active: true, description: 'Smaller position WSB-style trades' },
  { name: 'daytrading', category: 'Retail Trading', priority: 16, active: true, description: 'Day trading strategies' },
  { name: 'swing_trading', category: 'Retail Trading', priority: 17, active: true, description: 'Swing trading discussion' },
  { name: 'trading', category: 'Retail Trading', priority: 18, active: true, description: 'General trading discussion' },
  { name: 'SecurityHolders', category: 'Retail Trading', priority: 19, active: true, description: 'Security holders community' },
  { name: 'StockMarketIndia', category: 'Retail Trading', priority: 20, active: true, description: 'Indian stock market' },

  // Crypto & DeFi (Priority 21-30) - Cryptocurrency related
  { name: 'CryptoCurrency', category: 'Crypto & DeFi', priority: 21, active: true, description: 'General cryptocurrency discussion' },
  { name: 'Bitcoin', category: 'Crypto & DeFi', priority: 22, active: true, description: 'Bitcoin specific discussion' },
  { name: 'ethereum', category: 'Crypto & DeFi', priority: 23, active: true, description: 'Ethereum discussion' },
  { name: 'DeFi', category: 'Crypto & DeFi', priority: 24, active: true, description: 'Decentralized finance' },
  { name: 'altcoin', category: 'Crypto & DeFi', priority: 25, active: true, description: 'Alternative cryptocurrencies' },
  { name: 'CryptoMoonShots', category: 'Crypto & DeFi', priority: 26, active: true, description: 'High-risk crypto plays' },
  { name: 'SatoshiStreetBets', category: 'Crypto & DeFi', priority: 27, active: true, description: 'WSB-style crypto trading' },
  { name: 'CryptoMarkets', category: 'Crypto & DeFi', priority: 28, active: true, description: 'Crypto market analysis' },
  { name: 'dogecoin', category: 'Crypto & DeFi', priority: 29, active: true, description: 'Dogecoin community' },
  { name: 'NFT', category: 'Crypto & DeFi', priority: 30, active: true, description: 'NFT discussion' },

  // Tech & Innovation (Priority 31-40) - Technology focused
  { name: 'technology', category: 'Tech & Innovation', priority: 31, active: true, description: 'General technology news' },
  { name: 'artificial', category: 'Tech & Innovation', priority: 32, active: true, description: 'AI and machine learning' },
  { name: 'MachineLearning', category: 'Tech & Innovation', priority: 33, active: true, description: 'ML discussion and news' },
  { name: 'singularity', category: 'Tech & Innovation', priority: 34, active: true, description: 'AI singularity discussion' },
  { name: 'Futurology', category: 'Tech & Innovation', priority: 35, active: true, description: 'Future technology trends' },
  { name: 'startups', category: 'Tech & Innovation', priority: 36, active: true, description: 'Startup companies and culture' },
  { name: 'entrepreneurship', category: 'Tech & Innovation', priority: 37, active: true, description: 'Entrepreneurship discussion' },
  { name: 'business', category: 'Tech & Innovation', priority: 38, active: true, description: 'General business discussion' },
  { name: 'programming', category: 'Tech & Innovation', priority: 39, active: true, description: 'Programming and development' },
  { name: 'teslamotors', category: 'Tech & Innovation', priority: 40, active: true, description: 'Tesla specific discussion' },

  // Stock-Specific Communities (Priority 41-50) - Individual stock communities
  { name: 'PLTR', category: 'Stock-Specific', priority: 41, active: true, description: 'Palantir discussion' },
  { name: 'TSLA', category: 'Stock-Specific', priority: 42, active: true, description: 'Tesla stock discussion' },
  { name: 'AMD_Stock', category: 'Stock-Specific', priority: 43, active: true, description: 'AMD stock analysis' },
  { name: 'NVDA_Stock', category: 'Stock-Specific', priority: 44, active: true, description: 'NVIDIA stock discussion' },
  { name: 'GME', category: 'Stock-Specific', priority: 45, active: true, description: 'GameStop discussion' },
  { name: 'Superstonk', category: 'Stock-Specific', priority: 46, active: true, description: 'GameStop DD community' },
  { name: 'amcstock', category: 'Stock-Specific', priority: 47, active: true, description: 'AMC stock discussion' },
  { name: 'AAPL', category: 'Stock-Specific', priority: 48, active: true, description: 'Apple stock discussion' },
  { name: 'MSFT_Stock', category: 'Stock-Specific', priority: 49, active: true, description: 'Microsoft stock discussion' },
  { name: 'SPACs', category: 'Stock-Specific', priority: 50, active: true, description: 'SPAC investments' },

  // Economic & News (Priority 51-60) - Economic and news focused
  { name: 'Economics', category: 'Economic & News', priority: 51, active: true, description: 'Economic theory and analysis' },
  { name: 'news', category: 'Economic & News', priority: 52, active: true, description: 'General news' },
  { name: 'worldnews', category: 'Economic & News', priority: 53, active: true, description: 'International news' },
  { name: 'economics', category: 'Economic & News', priority: 54, active: true, description: 'Economic discussion' },
  { name: 'geopolitics', category: 'Economic & News', priority: 55, active: true, description: 'Geopolitical analysis' },
  { name: 'energy', category: 'Economic & News', priority: 56, active: true, description: 'Energy sector discussion' },
  { name: 'oil', category: 'Economic & News', priority: 57, active: true, description: 'Oil and petroleum' },
  { name: 'gold', category: 'Economic & News', priority: 58, active: true, description: 'Gold and precious metals' },
  { name: 'inflation', category: 'Economic & News', priority: 59, active: true, description: 'Inflation discussion' },
  { name: 'recession', category: 'Economic & News', priority: 60, active: true, description: 'Recession analysis' },

  // Alternative Investments (Priority 61-70) - Non-traditional investments
  { name: 'realestate', category: 'Alternative Investments', priority: 61, active: true, description: 'Real estate investing' },
  { name: 'REITs', category: 'Alternative Investments', priority: 62, active: true, description: 'Real Estate Investment Trusts' },
  { name: 'commodities', category: 'Alternative Investments', priority: 63, active: true, description: 'Commodity trading' },
  { name: 'forex', category: 'Alternative Investments', priority: 64, active: true, description: 'Foreign exchange trading' },
  { name: 'bonds', category: 'Alternative Investments', priority: 65, active: true, description: 'Bond investing' },
  { name: 'futures', category: 'Alternative Investments', priority: 66, active: true, description: 'Futures trading' },
  { name: 'collectibles', category: 'Alternative Investments', priority: 67, active: true, description: 'Collectible investments' },
  { name: 'wine', category: 'Alternative Investments', priority: 68, active: false, description: 'Wine investing' },
  { name: 'art', category: 'Alternative Investments', priority: 69, active: false, description: 'Art investing' },
  { name: 'watches', category: 'Alternative Investments', priority: 70, active: false, description: 'Watch collecting' },

  // Learning & Education (Priority 71-80) - Educational content
  { name: 'SecurityAnalysis', category: 'Learning & Education', priority: 71, active: true, description: 'Security analysis education' },
  { name: 'financialindependence', category: 'Learning & Education', priority: 72, active: true, description: 'FI/RE education' },
  { name: 'personalfinance', category: 'Learning & Education', priority: 73, active: true, description: 'Personal finance advice' },
  { name: 'investing_discussion', category: 'Learning & Education', priority: 74, active: true, description: 'Investment education' },
  { name: 'SecurityHolders', category: 'Learning & Education', priority: 75, active: true, description: 'Investor education' },
  { name: 'financialplanning', category: 'Learning & Education', priority: 76, active: true, description: 'Financial planning' },
  { name: 'money', category: 'Learning & Education', priority: 77, active: true, description: 'General money discussion' },
  { name: 'frugal', category: 'Learning & Education', priority: 78, active: false, description: 'Frugal living' },
  { name: 'budgets', category: 'Learning & Education', priority: 79, active: false, description: 'Budgeting advice' },
  { name: 'creditcards', category: 'Learning & Education', priority: 80, active: false, description: 'Credit card discussion' },
];

export const SUBREDDIT_CATEGORIES = [
  'Core Financial',
  'Retail Trading', 
  'Crypto & DeFi',
  'Tech & Innovation',
  'Stock-Specific',
  'Economic & News',
  'Alternative Investments',
  'Learning & Education'
];

export const getSubredditsByCategory = (category: string): Subreddit[] => {
  return SUBREDDIT_UNIVERSE.filter(subreddit => subreddit.category === category);
};

export const getActiveSubreddits = (): Subreddit[] => {
  return SUBREDDIT_UNIVERSE.filter(subreddit => subreddit.active);
};

export const getSubredditsByPriority = (limit?: number): Subreddit[] => {
  const sorted = SUBREDDIT_UNIVERSE
    .filter(subreddit => subreddit.active)
    .sort((a, b) => a.priority - b.priority);
  
  return limit ? sorted.slice(0, limit) : sorted;
};

export const getSubredditNames = (activeOnly: boolean = false): string[] => {
  const subreddits = activeOnly ? getActiveSubreddits() : SUBREDDIT_UNIVERSE;
  return subreddits.map(subreddit => subreddit.name);
};

export const getHighPrioritySubreddits = (maxPriority: number = 20): string[] => {
  return SUBREDDIT_UNIVERSE
    .filter(subreddit => subreddit.active && subreddit.priority <= maxPriority)
    .sort((a, b) => a.priority - b.priority)
    .map(subreddit => subreddit.name);
};

export const getCoreFinancialSubreddits = (): string[] => {
  return getSubredditsByCategory('Core Financial')
    .filter(subreddit => subreddit.active)
    .sort((a, b) => a.priority - b.priority)
    .map(subreddit => subreddit.name);
};

export const getSubredditString = (categories?: string[], maxPriority?: number): string => {
  let filtered = SUBREDDIT_UNIVERSE.filter(subreddit => subreddit.active);
  
  if (categories && categories.length > 0) {
    filtered = filtered.filter(subreddit => categories.includes(subreddit.category));
  }
  
  if (maxPriority) {
    filtered = filtered.filter(subreddit => subreddit.priority <= maxPriority);
  }
  
  return filtered
    .sort((a, b) => a.priority - b.priority)
    .map(subreddit => subreddit.name)
    .join(',');
};

// Default subreddit configurations for different use cases
export const DEFAULT_CONFIGS = {
  // High-priority financial subreddits for real-time sentiment
  realtime: getHighPrioritySubreddits(10),
  
  // Core financial subreddits for general analysis  
  core: getCoreFinancialSubreddits(),
  
  // All active subreddits for comprehensive analysis
  comprehensive: getSubredditNames(true),
  
  // Legacy configuration matching current hardcoded values
  legacy: ['stocks', 'investing', 'SecurityAnalysis', 'ValueInvesting', 'StockMarket', 'wallstreetbets', 'pennystocks']
};