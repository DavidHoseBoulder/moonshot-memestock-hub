-- Drop the old market_data table as it's been replaced by enhanced_market_data
-- All functions now use enhanced_market_data instead

DROP TABLE IF EXISTS public.market_data CASCADE;