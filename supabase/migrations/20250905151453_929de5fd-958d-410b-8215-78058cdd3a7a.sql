-- Add OHLC columns to enhanced_market_data table
ALTER TABLE public.enhanced_market_data 
ADD COLUMN price_open numeric,
ADD COLUMN price_high numeric,
ADD COLUMN price_low numeric,
ADD COLUMN price_close numeric GENERATED ALWAYS AS (price) STORED;