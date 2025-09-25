-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cron job to run StockTwits data collection daily at 8:00 AM ET
-- This converts to 13:00 UTC (8 AM ET = 1 PM UTC, accounting for EST)
SELECT cron.schedule(
  'stocktwits-daily-collection',
  '0 13 * * 1-5', -- Monday through Friday at 1:00 PM UTC (8:00 AM ET)
  $$
  select
    net.http_post(
        url:='https://pdgjafywsxesgwukotxh.supabase.co/functions/v1/stocktwits-data',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw"}'::jsonb,
        body:='{"days": 1, "limitPerDay": 150, "chunkSize": 15, "chunkDelayMs": 90000, "symbolDelayMs": 1800, "fetchRetries": 3}'::jsonb
    ) as request_id;
  $$
);

-- Create a cron job for weekend backfill (Saturday at 10:00 AM ET = 3:00 PM UTC)
-- This will catch up on any missed data with a 3-day lookback
SELECT cron.schedule(
  'stocktwits-weekend-backfill',
  '0 15 * * 6', -- Saturday at 3:00 PM UTC (10:00 AM ET)
  $$
  select
    net.http_post(
        url:='https://pdgjafywsxesgwukotxh.supabase.co/functions/v1/stocktwits-data',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw"}'::jsonb,
        body:='{"days": 3, "limitPerDay": 150, "chunkSize": 10, "chunkDelayMs": 120000, "symbolDelayMs": 2000, "fetchRetries": 3}'::jsonb
    ) as request_id;
  $$
);