-- Clear stale market data from 2023 to fix cache issue
DELETE FROM enhanced_market_data 
WHERE data_date < CURRENT_DATE - INTERVAL '1 day';