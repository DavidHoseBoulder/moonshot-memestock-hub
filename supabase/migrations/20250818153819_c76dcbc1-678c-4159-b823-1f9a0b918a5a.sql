-- Expand ticker_universe to include all tickers from stockUniverse.ts
-- Map categories to sectors and set priorities based on category importance

INSERT INTO ticker_universe (symbol, name, sector, priority, active) VALUES
-- Meme & Retail (Priority 1-10) - Highest priority for sentiment tracking
('GME', 'GameStop Corp', 'Consumer Discretionary', 1, true),
('AMC', 'AMC Entertainment Holdings Inc', 'Communication Services', 2, true),
('BB', 'BlackBerry Ltd', 'Technology', 3, true),
('NOK', 'Nokia Corp', 'Technology', 4, true),
('KOSS', 'Koss Corp', 'Consumer Discretionary', 5, true),
('CLOV', 'Clover Health Investments Corp', 'Health Care', 6, true),
('SNDL', 'Sundial Growers Inc', 'Consumer Staples', 7, true),
('DWAC', 'Digital World Acquisition Corp', 'Financial Services', 8, true),
('VFS', 'VinFast Auto Ltd', 'Consumer Discretionary', 9, true),
('HKD', 'AMTD Digital Inc', 'Financial Services', 10, true),

-- Tech & Momentum (Priority 11-20) - High priority large caps
('TSLA', 'Tesla Inc', 'Consumer Discretionary', 11, true),
('AAPL', 'Apple Inc', 'Technology', 12, true),
('MSFT', 'Microsoft Corp', 'Technology', 13, true),
('NVDA', 'NVIDIA Corp', 'Technology', 14, true),
('AMD', 'Advanced Micro Devices Inc', 'Technology', 15, true),
('PLTR', 'Palantir Technologies Inc', 'Technology', 16, true),
('META', 'Meta Platforms Inc', 'Communication Services', 17, true),
('AMZN', 'Amazon.com Inc', 'Consumer Discretionary', 18, true),
('SNAP', 'Snap Inc', 'Communication Services', 19, true),
('INTC', 'Intel Corp', 'Technology', 20, true),

-- AI & Data (Priority 21-30) - High growth AI sector
('AI', 'C3.ai Inc', 'Technology', 21, true),
('BBAI', 'BigBear.ai Holdings Inc', 'Technology', 22, true),
('SOUN', 'SoundHound AI Inc', 'Technology', 23, true),
('UPST', 'Upstart Holdings Inc', 'Financial Services', 24, true),
('SNOW', 'Snowflake Inc', 'Technology', 25, true),
('NET', 'Cloudflare Inc', 'Technology', 26, true),
('DDOG', 'Datadog Inc', 'Technology', 27, true),
('CRWD', 'CrowdStrike Holdings Inc', 'Technology', 28, true),
('PATH', 'UiPath Inc', 'Technology', 29, true),

-- Fintech & Crypto (Priority 31-40) - Volatile crypto-related stocks
('COIN', 'Coinbase Global Inc', 'Financial Services', 31, true),
('RIOT', 'Riot Platforms Inc', 'Financial Services', 32, true),
('MARA', 'Marathon Digital Holdings Inc', 'Financial Services', 33, true),
('HOOD', 'Robinhood Markets Inc', 'Financial Services', 34, true),
('SQ', 'Block Inc', 'Financial Services', 35, true),
('PYPL', 'PayPal Holdings Inc', 'Financial Services', 36, true),
('SOFI', 'SoFi Technologies Inc', 'Financial Services', 37, true),
('LCID', 'Lucid Group Inc', 'Consumer Discretionary', 38, true),
('RBLX', 'Roblox Corp', 'Communication Services', 39, true),
('MSTR', 'MicroStrategy Inc', 'Technology', 40, true),

-- EV & Alt-Tech (Priority 41-50) - Electric vehicle sector
('NIO', 'NIO Inc', 'Consumer Discretionary', 41, true),
('XPEV', 'XPeng Inc', 'Consumer Discretionary', 42, true),
('LI', 'Li Auto Inc', 'Consumer Discretionary', 43, true),
('RIVN', 'Rivian Automotive Inc', 'Consumer Discretionary', 44, true),
('CHPT', 'ChargePoint Holdings Inc', 'Technology', 45, true),
('NKLA', 'Nikola Corp', 'Industrials', 46, true),
('ASTS', 'AST SpaceMobile Inc', 'Communication Services', 47, true),
('SPCE', 'Virgin Galactic Holdings Inc', 'Industrials', 48, true),
('QS', 'QuantumScape Corp', 'Technology', 49, true),
('RUN', 'Sunrun Inc', 'Technology', 50, true),

-- Biotech & Pharma (Priority 51-60) - Healthcare/biotech
('NVAX', 'Novavax Inc', 'Health Care', 51, true),
('SAVA', 'Cassava Sciences Inc', 'Health Care', 52, true),
('MRNA', 'Moderna Inc', 'Health Care', 53, true),
('BNTX', 'BioNTech SE', 'Health Care', 54, true),
('CYTO', 'Altamira Therapeutics Ltd', 'Health Care', 55, true),
('MNMD', 'Mind Medicine Inc', 'Health Care', 56, true),
('IOVA', 'Iovance Biotherapeutics Inc', 'Health Care', 57, true),
('VSTM', 'Verastem Inc', 'Health Care', 58, true),
('PFE', 'Pfizer Inc', 'Health Care', 59, true),
('GILD', 'Gilead Sciences Inc', 'Health Care', 60, true),

-- Media & Internet (Priority 61-70) - Entertainment/media
('DIS', 'The Walt Disney Co', 'Communication Services', 61, true),
('NFLX', 'Netflix Inc', 'Communication Services', 62, true),
('WBD', 'Warner Bros Discovery Inc', 'Communication Services', 63, true),
('TTD', 'The Trade Desk Inc', 'Technology', 64, true),
('ROKU', 'Roku Inc', 'Communication Services', 65, true),
('PARA', 'Paramount Global', 'Communication Services', 66, true),
('FUBO', 'fuboTV Inc', 'Communication Services', 67, true),
('PINS', 'Pinterest Inc', 'Communication Services', 68, true),
('BILI', 'Bilibili Inc', 'Communication Services', 69, true),
('GOOGL', 'Alphabet Inc', 'Communication Services', 70, true),

-- Consumer Buzz (Priority 71-80) - Consumer discretionary
('CVNA', 'Carvana Co', 'Consumer Discretionary', 71, true),
('CHWY', 'Chewy Inc', 'Consumer Discretionary', 72, true),
('ETSY', 'Etsy Inc', 'Consumer Discretionary', 73, true),
('PTON', 'Peloton Interactive Inc', 'Consumer Discretionary', 74, true),
('BYND', 'Beyond Meat Inc', 'Consumer Staples', 75, true),
('WMT', 'Walmart Inc', 'Consumer Staples', 76, true),
('TGT', 'Target Corp', 'Consumer Discretionary', 77, true),
('COST', 'Costco Wholesale Corp', 'Consumer Staples', 78, true),
('BURL', 'Burlington Stores Inc', 'Consumer Discretionary', 79, true),
('NKE', 'NIKE Inc', 'Consumer Discretionary', 80, true),

-- Banking (Priority 81-90) - Financial services
('PNC', 'The PNC Financial Services Group Inc', 'Financial Services', 81, true),
('WAL', 'Western Alliance Bancorporation', 'Financial Services', 82, true),
('BANC', 'Banc of California Inc', 'Financial Services', 83, true),
('SCHW', 'The Charles Schwab Corp', 'Financial Services', 84, true),
('GS', 'The Goldman Sachs Group Inc', 'Financial Services', 85, true),
('JPM', 'JPMorgan Chase & Co', 'Financial Services', 86, true),
('BAC', 'Bank of America Corp', 'Financial Services', 87, true),
('C', 'Citigroup Inc', 'Financial Services', 88, true),
('HBAN', 'Huntington Bancshares Inc', 'Financial Services', 89, true),
('USB', 'U.S. Bancorp', 'Financial Services', 90, true),

-- SPAC & Penny (Priority 91-100) - Lower priority speculative plays
('HYMC', 'Hycroft Mining Holding Corp', 'Materials', 91, false),
('MULN', 'Mullen Automotive Inc', 'Consumer Discretionary', 92, false),
('MCOM', 'micromobility.com Inc', 'Consumer Discretionary', 93, false),
('TTOO', 'T2 Biosystems Inc', 'Health Care', 94, false),
('FFIE', 'Faraday Future Intelligent Electric Inc', 'Consumer Discretionary', 95, false),
('MEGL', 'Magic Empire Global Ltd', 'Consumer Discretionary', 96, false),
('ILAG', 'Intelligent Living Application Group Inc', 'Technology', 97, false),
('ATER', 'Aterian Inc', 'Consumer Discretionary', 98, false),
('CTRM', 'Castor Maritime Inc', 'Energy', 99, false),
('BBIG', 'Vinco Ventures Inc', 'Technology', 100, false)

ON CONFLICT (symbol) DO UPDATE SET
  name = EXCLUDED.name,
  sector = EXCLUDED.sector,
  updated_at = now()
WHERE ticker_universe.priority > EXCLUDED.priority; -- Only update if new priority is higher

-- Apply ticker corrections from stockUniverse.ts
UPDATE ticker_universe SET symbol = 'RBLX' WHERE symbol = 'ROBLOX';
UPDATE ticker_universe SET symbol = 'AI' WHERE symbol = 'C3AI';
UPDATE ticker_universe SET symbol = 'MCOM' WHERE symbol = 'HLBZ';
UPDATE ticker_universe SET symbol = 'BANC' WHERE symbol = 'PACW';

-- Remove excluded tickers
DELETE FROM ticker_universe WHERE symbol IN ('VINE', 'CEI');