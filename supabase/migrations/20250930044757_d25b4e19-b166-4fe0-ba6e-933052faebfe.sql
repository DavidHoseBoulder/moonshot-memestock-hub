-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create cron job to run reddit-loader-orchestrator daily at 11:30 UTC
SELECT cron.schedule(
  'reddit-loader-daily',
  '30 11 * * *',
  $$
  SELECT
    net.http_post(
        url:='https://pdgjafywsxesgwukotxh.supabase.co/functions/v1/reddit-loader-orchestrator',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);