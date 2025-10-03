-- Remove the reddit-loader-daily cron job
SELECT cron.unschedule('reddit-loader-daily');