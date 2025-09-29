-- Update the StockTwits cron job to use larger chunks and better timing
SELECT cron.unschedule('stocktwits-sunday-backfill');

-- Create a Sunday backfill job with optimized settings
SELECT cron.schedule(
  'stocktwits-sunday-backfill',
  '0 15 * * 0', -- Sunday at 3:00 PM UTC (10:00 AM ET)
  $$
  select
    net.http_post(
        url:='https://pdgjafywsxesgwukotxh.supabase.co/functions/v1/stocktwits-data',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw"}'::jsonb,
        body:='{"days": 2, "limitPerDay": 150, "chunkSize": 15, "chunkDelayMs": 60000, "symbolDelayMs": 1500, "fetchRetries": 3}'::jsonb
    ) as request_id;
  $$
);