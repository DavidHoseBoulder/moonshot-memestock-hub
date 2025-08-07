-- Add unique constraint for proper upsert functionality
ALTER TABLE public.enhanced_market_data 
ADD CONSTRAINT unique_symbol_date UNIQUE (symbol, data_date);