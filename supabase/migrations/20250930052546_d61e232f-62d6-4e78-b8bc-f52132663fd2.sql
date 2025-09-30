-- Create cron job to run sentiment-score daily at 13:30 UTC
SELECT cron.schedule(
  'sentiment-score-daily',
  '30 13 * * *',
  $$
  SELECT
    net.http_post(
        url:='https://pdgjafywsxesgwukotxh.supabase.co/functions/v1/sentiment-score',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw"}'::jsonb,
        body:='{"sources":["reddit"],"min_mentions":1}'::jsonb
    ) as request_id;
  $$
);