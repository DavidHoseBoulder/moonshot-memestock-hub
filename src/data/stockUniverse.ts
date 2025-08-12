
export interface Stock {
  ticker: string;
  category: string;
}

export const STOCK_UNIVERSE: Stock[] = [
  // Meme & Retail
  { ticker: 'GME', category: 'Meme & Retail' },
  { ticker: 'AMC', category: 'Meme & Retail' },
  { ticker: 'BB', category: 'Meme & Retail' },
  { ticker: 'NOK', category: 'Meme & Retail' },
  { ticker: 'KOSS', category: 'Meme & Retail' },
  { ticker: 'CLOV', category: 'Meme & Retail' },
  { ticker: 'SNDL', category: 'Meme & Retail' },
  { ticker: 'DWAC', category: 'Meme & Retail' },
  { ticker: 'VFS', category: 'Meme & Retail' },
  { ticker: 'HKD', category: 'Meme & Retail' },
  
  // Tech & Momentum
  { ticker: 'TSLA', category: 'Tech & Momentum' },
  { ticker: 'AAPL', category: 'Tech & Momentum' },
  { ticker: 'MSFT', category: 'Tech & Momentum' },
  { ticker: 'NVDA', category: 'Tech & Momentum' },
  { ticker: 'AMD', category: 'Tech & Momentum' },
  { ticker: 'PLTR', category: 'Tech & Momentum' },
  { ticker: 'META', category: 'Tech & Momentum' },
  { ticker: 'AMZN', category: 'Tech & Momentum' },
  { ticker: 'SNAP', category: 'Tech & Momentum' },
  { ticker: 'INTC', category: 'Tech & Momentum' },
  
  // AI & Data
  { ticker: 'AI', category: 'AI & Data' },
  { ticker: 'BBAI', category: 'AI & Data' },
  { ticker: 'SOUN', category: 'AI & Data' },
  { ticker: 'C3AI', category: 'AI & Data' },
  { ticker: 'UPST', category: 'AI & Data' },
  { ticker: 'SNOW', category: 'AI & Data' },
  { ticker: 'NET', category: 'AI & Data' },
  { ticker: 'DDOG', category: 'AI & Data' },
  { ticker: 'CRWD', category: 'AI & Data' },
  { ticker: 'PATH', category: 'AI & Data' },
  
  // Fintech & Crypto
  { ticker: 'COIN', category: 'Fintech & Crypto' },
  { ticker: 'RIOT', category: 'Fintech & Crypto' },
  { ticker: 'MARA', category: 'Fintech & Crypto' },
  { ticker: 'HOOD', category: 'Fintech & Crypto' },
  { ticker: 'SQ', category: 'Fintech & Crypto' },
  { ticker: 'PYPL', category: 'Fintech & Crypto' },
  { ticker: 'SOFI', category: 'Fintech & Crypto' },
  { ticker: 'LCID', category: 'Fintech & Crypto' },
  { ticker: 'RBLX', category: 'Fintech & Crypto' },
  { ticker: 'MSTR', category: 'Fintech & Crypto' },
  
  // EV & Alt-Tech
  { ticker: 'NIO', category: 'EV & Alt-Tech' },
  { ticker: 'XPEV', category: 'EV & Alt-Tech' },
  { ticker: 'LI', category: 'EV & Alt-Tech' },
  { ticker: 'RIVN', category: 'EV & Alt-Tech' },
  { ticker: 'CHPT', category: 'EV & Alt-Tech' },
  { ticker: 'NKLA', category: 'EV & Alt-Tech' },
  { ticker: 'ASTS', category: 'EV & Alt-Tech' },
  { ticker: 'SPCE', category: 'EV & Alt-Tech' },
  { ticker: 'QS', category: 'EV & Alt-Tech' },
  { ticker: 'RUN', category: 'EV & Alt-Tech' },
  
  // Biotech & Pharma
  { ticker: 'NVAX', category: 'Biotech & Pharma' },
  { ticker: 'SAVA', category: 'Biotech & Pharma' },
  { ticker: 'MRNA', category: 'Biotech & Pharma' },
  { ticker: 'BNTX', category: 'Biotech & Pharma' },
  { ticker: 'CYTO', category: 'Biotech & Pharma' },
  { ticker: 'MNMD', category: 'Biotech & Pharma' },
  { ticker: 'IOVA', category: 'Biotech & Pharma' },
  { ticker: 'VSTM', category: 'Biotech & Pharma' },
  { ticker: 'PFE', category: 'Biotech & Pharma' },
  { ticker: 'GILD', category: 'Biotech & Pharma' },
  
  // Media & Internet
  { ticker: 'DIS', category: 'Media & Internet' },
  { ticker: 'NFLX', category: 'Media & Internet' },
  { ticker: 'WBD', category: 'Media & Internet' },
  { ticker: 'TTD', category: 'Media & Internet' },
  { ticker: 'ROKU', category: 'Media & Internet' },
  { ticker: 'PARA', category: 'Media & Internet' },
  { ticker: 'FUBO', category: 'Media & Internet' },
  { ticker: 'PINS', category: 'Media & Internet' },
  { ticker: 'BILI', category: 'Media & Internet' },
  { ticker: 'GOOGL', category: 'Media & Internet' },
  
  // Consumer Buzz
  { ticker: 'CVNA', category: 'Consumer Buzz' },
  { ticker: 'CHWY', category: 'Consumer Buzz' },
  { ticker: 'ETSY', category: 'Consumer Buzz' },
  { ticker: 'PTON', category: 'Consumer Buzz' },
  { ticker: 'BYND', category: 'Consumer Buzz' },
  { ticker: 'WMT', category: 'Consumer Buzz' },
  { ticker: 'TGT', category: 'Consumer Buzz' },
  { ticker: 'COST', category: 'Consumer Buzz' },
  { ticker: 'BURL', category: 'Consumer Buzz' },
  { ticker: 'NKE', category: 'Consumer Buzz' },
  
  // Banking
  { ticker: 'PNC', category: 'Banking' },
  { ticker: 'WAL', category: 'Banking' },
  { ticker: 'BANC', category: 'Banking' },
  { ticker: 'SCHW', category: 'Banking' },
  { ticker: 'GS', category: 'Banking' },
  { ticker: 'JPM', category: 'Banking' },
  { ticker: 'BAC', category: 'Banking' },
  { ticker: 'C', category: 'Banking' },
  { ticker: 'HBAN', category: 'Banking' },
  { ticker: 'USB', category: 'Banking' },
  
  // SPAC & Penny
  { ticker: 'HYMC', category: 'SPAC & Penny' },
  { ticker: 'MULN', category: 'SPAC & Penny' },
  { ticker: 'MCOM', category: 'SPAC & Penny' },
  { ticker: 'TTOO', category: 'SPAC & Penny' },
  { ticker: 'FFIE', category: 'SPAC & Penny' },
  { ticker: 'MEGL', category: 'SPAC & Penny' },
  { ticker: 'ILAG', category: 'SPAC & Penny' },
  { ticker: 'ATER', category: 'SPAC & Penny' },
  { ticker: 'CTRM', category: 'SPAC & Penny' },
  { ticker: 'BBIG', category: 'SPAC & Penny' },
];

export const CATEGORIES = [
  'Meme & Retail',
  'Tech & Momentum',
  'AI & Data',
  'Fintech & Crypto',
  'EV & Alt-Tech',
  'Biotech & Pharma',
  'Media & Internet',
  'Consumer Buzz',
  'Banking',
  'SPAC & Penny'
];

export const getStocksByCategory = (category: string) => {
  return STOCK_UNIVERSE.filter(stock => stock.category === category);
};

export const getAllTickers = () => {
  return STOCK_UNIVERSE.map(stock => stock.ticker);
};

// Known safe ticker corrections (source mismatches, rebrands, mergers)
export const TICKER_CORRECTIONS: Record<string, string> = {
  ROBLOX: 'RBLX', // Company name vs ticker
  C3AI: 'AI',     // Brand name vs ticker
  HLBZ: 'MCOM',   // Helbiz rebranded to micromobility.com
  PACW: 'BANC',   // PacWest merged with Banc of California
};

// Some tickers consistently 404 or are delisted on Yahoo — skip them
export const EXCLUDED_TICKERS = new Set<string>([
  'VINE', // Fresh Vine Wine — often missing data
  'CEI',  // Camber Energy — unreliable in Yahoo historical API
]);

// Returns canonical tickers with corrections applied, deduplicated, and exclusions removed
export const getAllCanonicalTickers = () => {
  const set = new Set<string>();
  for (const { ticker } of STOCK_UNIVERSE) {
    const upper = ticker.toUpperCase();
    if (EXCLUDED_TICKERS.has(upper)) continue;
    const corrected = TICKER_CORRECTIONS[upper] ?? upper;
    set.add(corrected);
  }
  return Array.from(set);
};
