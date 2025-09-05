-- Safe migration to restructure price columns without data loss
-- Handle dependent objects properly

-- Step 1: Drop dependent view temporarily
DROP VIEW IF EXISTS prices_daily;

-- Step 2: Add new OHLC columns if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enhanced_market_data' AND column_name = 'price_open') THEN
    ALTER TABLE enhanced_market_data ADD COLUMN price_open numeric;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enhanced_market_data' AND column_name = 'price_high') THEN
    ALTER TABLE enhanced_market_data ADD COLUMN price_high numeric;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enhanced_market_data' AND column_name = 'price_low') THEN
    ALTER TABLE enhanced_market_data ADD COLUMN price_low numeric;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enhanced_market_data' AND column_name = 'price_close_new') THEN
    ALTER TABLE enhanced_market_data ADD COLUMN price_close_new numeric;
  END IF;
END $$;

-- Step 3: Migrate existing price data to price_close_new
UPDATE enhanced_market_data 
SET price_close_new = price 
WHERE price_close_new IS NULL AND price IS NOT NULL;

-- Step 4: Drop the generated price_close column if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enhanced_market_data' AND column_name = 'price_close') THEN
    ALTER TABLE enhanced_market_data DROP COLUMN price_close;
  END IF;
END $$;

-- Step 5: Rename price_close_new to price_close
ALTER TABLE enhanced_market_data RENAME COLUMN price_close_new TO price_close;

-- Step 6: Fill missing OHLC data with existing price data where needed
UPDATE enhanced_market_data 
SET 
  price_open = COALESCE(price_open, price_close),
  price_high = COALESCE(price_high, price_close),
  price_low = COALESCE(price_low, price_close)
WHERE price_close IS NOT NULL;

-- Step 7: Drop the old price column (now safe to do)
ALTER TABLE enhanced_market_data DROP COLUMN price;

-- Step 8: Create price as a generated column that aliases price_close
ALTER TABLE enhanced_market_data 
ADD COLUMN price numeric GENERATED ALWAYS AS (price_close) STORED;

-- Step 9: Recreate the prices_daily view to use the new structure
CREATE VIEW prices_daily AS
SELECT 
  symbol,
  data_date AS d,
  price_close AS close,
  volume
FROM enhanced_market_data;