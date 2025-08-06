-- Add unique constraint for market_data upserts
ALTER TABLE public.market_data 
ADD CONSTRAINT market_data_symbol_timestamp_unique 
UNIQUE (symbol, timestamp);