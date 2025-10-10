-- Update the polygon market data cron job to use the new scheduler function
-- that fetches all active symbols from ticker_universe

-- First, unschedule the old job
SELECT cron.unschedule('daily-polygon-import');

-- Create new cron job to run polygon-market-data-scheduler daily at 8:30 UTC
-- This runs after market close (4:00 PM ET = 8:00 PM UTC, so 8:30 UTC is next day at 4:30 AM ET)
SELECT cron.schedule(
  'daily-polygon-import',
  '30 20 * * 1-5', -- Monday through Friday at 8:30 PM UTC (4:30 PM ET)
  $$
  SELECT
    net.http_post(
        url:='https://pdgjafywsxesgwukotxh.supabase.co/functions/v1/polygon-market-data-scheduler',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);